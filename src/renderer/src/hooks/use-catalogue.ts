import axios from "axios";
import { useCallback, useEffect, useState } from "react";
import { useAppDispatch } from "./redux";
import { setGenres, setTags } from "@renderer/features";

export const externalResourcesInstance = axios.create({
  baseURL: import.meta.env.RENDERER_VITE_EXTERNAL_RESOURCES_URL,
});

// Mock data for when external resources are not available
const mockSteamPublishers = ["CD Projekt", "Bandai Namco", "Larian Studios", "Electronic Arts", "Ubisoft", "Bethesda", "Rockstar Games", "Valve", "Capcom", "Square Enix"];
const mockSteamDevelopers = ["CD Projekt Red", "FromSoftware", "Larian Studios", "BioWare", "Ubisoft Montreal", "Bethesda Game Studios", "Rockstar North", "Valve Corporation", "Capcom", "Square Enix"];

export function useCatalogue() {
  const dispatch = useAppDispatch();

  const [steamPublishers, setSteamPublishers] = useState<string[]>([]);
  const [steamDevelopers, setSteamDevelopers] = useState<string[]>([]);

  const getSteamUserTags = useCallback(() => {
    externalResourcesInstance.get("/steam-user-tags.json").then((response) => {
      dispatch(setTags(response.data));
    }).catch(() => {
      // Use empty object as fallback
      dispatch(setTags({}));
    });
  }, [dispatch]);

  const getSteamGenres = useCallback(() => {
    externalResourcesInstance.get("/steam-genres.json").then((response) => {
      dispatch(setGenres(response.data));
    }).catch(() => {
      // Use empty object as fallback
      dispatch(setGenres({}));
    });
  }, [dispatch]);

  const getSteamPublishers = useCallback(() => {
    externalResourcesInstance.get("/steam-publishers.json").then((response) => {
      setSteamPublishers(response.data);
    }).catch(() => {
      // Use mock data as fallback
      setSteamPublishers(mockSteamPublishers);
    });
  }, []);

  const getSteamDevelopers = useCallback(() => {
    externalResourcesInstance.get("/steam-developers.json").then((response) => {
      setSteamDevelopers(response.data);
    }).catch(() => {
      // Use mock data as fallback
      setSteamDevelopers(mockSteamDevelopers);
    });
  }, []);

  useEffect(() => {
    getSteamUserTags();
    getSteamGenres();
    getSteamPublishers();
    getSteamDevelopers();
  }, [
    getSteamUserTags,
    getSteamGenres,
    getSteamPublishers,
    getSteamDevelopers,
  ]);

  return { steamPublishers, steamDevelopers };
}
