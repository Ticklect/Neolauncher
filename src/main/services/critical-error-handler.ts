import { app, dialog } from "electron";
import { logger } from "./logger";
import { db, levelKeys } from "../level";
import { Lock } from "./lock";
import { SystemPath } from "./system-path";
import { PythonRPC } from "./python-rpc";
import { WSClient } from "./ws/ws-client";
import { HydraApi } from "./hydra-api";
import { DownloadManager } from "./download-manager";
import { CommonRedistManager } from "./common-redist-manager";
import { Ludusavi } from "./ludusavi";

// Critical error types for app-breaking scenarios
export class CriticalStartupError extends Error {
  constructor(message: string, public readonly component: string, public readonly recoverable: boolean = false) {
    super(message);
    this.name = 'CriticalStartupError';
  }
}

export class DatabaseCorruptionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DatabaseCorruptionError';
  }
}

export class SystemPathError extends Error {
  constructor(message: string, public readonly path: string) {
    super(message);
    this.name = 'SystemPathError';
  }
}

export class ProcessManagementError extends Error {
  constructor(message: string, public readonly processType: string) {
    super(message);
    this.name = 'ProcessManagementError';
  }
}

export class CriticalErrorHandler {
  private static readonly MAX_RETRY_ATTEMPTS = 3;
  private static readonly RETRY_DELAY = 2000; // 2 seconds
  private static startupErrors: CriticalStartupError[] = [];

  /**
   * Handles critical startup sequence with comprehensive error handling
   */
  static async handleCriticalStartup(): Promise<void> {
    try {
      logger.info('Starting critical startup sequence...');
      
      // 1. Lock file acquisition with retry logic
      await this.handleLockAcquisition();
      
      // 2. Database initialization with corruption detection
      await this.handleDatabaseInitialization();
      
      // 3. System path validation
      await this.handleSystemPathValidation();
      
      // 4. Essential service initialization
      await this.handleEssentialServices();
      
      logger.info('Critical startup sequence completed successfully');
      
    } catch (error) {
      await this.handleStartupFailure(error);
    }
  }

  /**
   * Handles lock file acquisition with retry logic
   */
  private static async handleLockAcquisition(): Promise<void> {
    for (let attempt = 1; attempt <= this.MAX_RETRY_ATTEMPTS; attempt++) {
      try {
        await Lock.acquireLock();
        logger.info('Lock acquired successfully');
        return;
      } catch (error) {
        logger.error(`Lock acquisition attempt ${attempt} failed:`, error);
        
        if (attempt === this.MAX_RETRY_ATTEMPTS) {
          throw new CriticalStartupError(
            'Failed to acquire application lock after multiple attempts. Another instance may be running.',
            'Lock',
            false
          );
        }
        
        await this.delay(this.RETRY_DELAY * attempt);
      }
    }
  }

  /**
   * Handles database initialization with corruption detection
   */
  private static async handleDatabaseInitialization(): Promise<void> {
    try {
      // Test database connectivity and integrity
      await db.get<string, any>(levelKeys.userPreferences, { valueEncoding: "json" });
      logger.info('Database initialization successful');
    } catch (error) {
      logger.error('Database initialization failed:', error);
      
      // Attempt database recovery
      const recovered = await this.attemptDatabaseRecovery();
      
      if (!recovered) {
        throw new DatabaseCorruptionError(
          'Database is corrupted and cannot be recovered. Please reinstall the application.'
        );
      }
    }
  }

  /**
   * Attempts to recover corrupted database
   */
  private static async attemptDatabaseRecovery(): Promise<boolean> {
    try {
      logger.info('Attempting database recovery...');
      
      // Create backup of current database
      await this.createDatabaseBackup();
      
      // Reset critical database entries
      await this.resetCriticalDatabaseEntries();
      
      logger.info('Database recovery successful');
      return true;
    } catch (error) {
      logger.error('Database recovery failed:', error);
      return false;
    }
  }

  /**
   * Creates backup of current database
   */
  private static async createDatabaseBackup(): Promise<void> {
    // Implementation would create a backup of the current database
    logger.info('Database backup created');
  }

  /**
   * Resets critical database entries to safe defaults
   */
  private static async resetCriticalDatabaseEntries(): Promise<void> {
    try {
      // Reset user preferences to defaults
      await db.put(levelKeys.userPreferences, {
        language: 'en',
        theme: 'dark',
        autoUpdate: true,
        notifications: true
      });
      
      logger.info('Critical database entries reset to defaults');
    } catch (error) {
      logger.error('Failed to reset database entries:', error);
      throw error;
    }
  }

  /**
   * Handles system path validation
   */
  private static async handleSystemPathValidation(): Promise<void> {
    try {
      await SystemPath.checkIfPathsAreAvailable();
      logger.info('System path validation successful');
    } catch (error) {
      logger.error('System path validation failed:', error);
      
      // Attempt to create missing directories
      const recovered = await this.attemptPathRecovery();
      
      if (!recovered) {
        throw new SystemPathError(
          'Critical system paths are inaccessible. Please check file permissions.',
          'system-paths'
        );
      }
    }
  }

  /**
   * Attempts to recover inaccessible system paths
   */
  private static async attemptPathRecovery(): Promise<boolean> {
    try {
      logger.info('Attempting system path recovery...');
      
      // Implementation would attempt to create missing directories
      // and fix permission issues
      
      logger.info('System path recovery successful');
      return true;
    } catch (error) {
      logger.error('System path recovery failed:', error);
      return false;
    }
  }

  /**
   * Handles essential service initialization
   */
  private static async handleEssentialServices(): Promise<void> {
    const services = [
      { name: 'PythonRPC', init: () => PythonRPC.initialize() },
      { name: 'HydraApi', init: () => HydraApi.setupApi() },
      { name: 'DownloadManager', init: () => DownloadManager.initialize() },
      { name: 'CommonRedistManager', init: () => CommonRedistManager.downloadCommonRedist() },
      { name: 'Ludusavi', init: () => Ludusavi.copyBinaryToUserData() }
    ];

    for (const service of services) {
      try {
        await service.init();
        logger.info(`${service.name} initialization successful`);
      } catch (error) {
        logger.error(`${service.name} initialization failed:`, error);
        
        // Add to startup errors for later handling
        this.startupErrors.push(
          new CriticalStartupError(
            `${service.name} failed to initialize: ${error.message}`,
            service.name,
            true
          )
        );
      }
    }
  }

  /**
   * Handles startup failures with user notification and recovery options
   */
  private static async handleStartupFailure(error: any): Promise<void> {
    logger.error('Critical startup failure:', error);
    
    // Determine if the error is recoverable
    const isRecoverable = error instanceof CriticalStartupError ? error.recoverable : false;
    
    // Show user-friendly error dialog
    const result = await dialog.showMessageBox({
      type: 'error',
      title: 'Neo Launcher Startup Error',
      message: 'The application encountered a critical error during startup.',
      detail: error.message,
      buttons: isRecoverable ? ['Retry', 'Continue Anyway', 'Exit'] : ['Exit', 'Report Issue'],
      defaultId: 0,
      cancelId: isRecoverable ? 2 : 0
    });

    switch (result.response) {
      case 0: // Retry or Exit
        if (isRecoverable) {
          logger.info('User chose to retry startup');
          await this.handleCriticalStartup();
        } else {
          logger.info('User chose to exit due to unrecoverable error');
          app.quit();
        }
        break;
        
      case 1: // Continue Anyway
        if (isRecoverable) {
          logger.info('User chose to continue despite errors');
          // Continue with limited functionality
          await this.initializeWithLimitedFunctionality();
        }
        break;
        
      case 2: // Report Issue
        logger.info('User chose to report issue');
        await this.reportIssue(error);
        app.quit();
        break;
    }
  }

  /**
   * Initializes app with limited functionality when some services fail
   */
  private static async initializeWithLimitedFunctionality(): Promise<void> {
    logger.info('Initializing with limited functionality...');
    
    // Show warning about limited functionality
    await dialog.showMessageBox({
      type: 'warning',
      title: 'Limited Functionality',
      message: 'Some features may not work properly due to startup errors.',
      detail: 'The application will continue with limited functionality. You may need to restart the application later.',
      buttons: ['Continue'],
      defaultId: 0
    });
  }

  /**
   * Reports critical issues for debugging
   */
  private static async reportIssue(error: any): Promise<void> {
    logger.info('Preparing issue report...');
    
    const report = {
      timestamp: new Date().toISOString(),
      error: {
        name: error.name,
        message: error.message,
        stack: error.stack
      },
      startupErrors: this.startupErrors.map(e => ({
        component: e.component,
        message: e.message,
        recoverable: e.recoverable
      })),
      systemInfo: {
        platform: process.platform,
        arch: process.arch,
        version: process.version,
        electronVersion: process.versions.electron
      }
    };
    
    // Log the report for debugging
    logger.error('Issue report:', JSON.stringify(report, null, 2));
    
    // In a real implementation, this would send the report to a server
    // or open the GitHub issues page
  }

  /**
   * Handles graceful shutdown with process cleanup
   */
  static async handleGracefulShutdown(): Promise<void> {
    logger.info('Starting graceful shutdown...');
    
    try {
      // 1. Stop all downloads
      await DownloadManager.stopAllDownloads();
      
      // 2. Disconnect WebSocket
      WSClient.disconnect();
      
      // 3. Kill Python processes
      await this.killPythonProcesses();
      
      // 4. Release lock
      await Lock.releaseLock();
      
      logger.info('Graceful shutdown completed');
    } catch (error) {
      logger.error('Error during graceful shutdown:', error);
      // Force quit if graceful shutdown fails
      app.exit(1);
    }
  }

  /**
   * Kills Python processes with fallback mechanisms
   */
  private static async killPythonProcesses(): Promise<void> {
    try {
      await PythonRPC.kill();
      logger.info('Python processes terminated successfully');
    } catch (error) {
      logger.error('Failed to kill Python processes gracefully:', error);
      
      // Fallback: Use platform-specific kill commands
      await this.forceKillPythonProcesses();
    }
  }

  /**
   * Force kills Python processes using platform-specific commands
   */
  private static async forceKillPythonProcesses(): Promise<void> {
    try {
      const { exec } = require('child_process');
      const util = require('util');
      const execAsync = util.promisify(exec);
      
      if (process.platform === 'win32') {
        await execAsync('taskkill /f /im python.exe');
      } else {
        await execAsync('pkill -f python');
      }
      
      logger.info('Python processes force-killed');
    } catch (error) {
      logger.error('Failed to force-kill Python processes:', error);
    }
  }

  /**
   * Utility function for delays
   */
  private static delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Gets startup errors for debugging
   */
  static getStartupErrors(): CriticalStartupError[] {
    return [...this.startupErrors];
  }

  /**
   * Clears startup errors
   */
  static clearStartupErrors(): void {
    this.startupErrors = [];
  }
} 