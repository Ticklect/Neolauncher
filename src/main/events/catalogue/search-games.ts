import type { CatalogueSearchPayload } from "@types";
import { registerEvent } from "../register-event";
import { HydraApi } from "@main/services";

// Mock data for when backend is not available
const mockGames = [
  {
    id: 1,
    title: "Cyberpunk 2077",
    description: "An open-world action-adventure story set in Night City",
    image: "https://via.placeholder.com/300x200?text=Cyberpunk+2077",
    rating: 4.5,
    price: 59.99,
    developer: "CD Projekt Red",
    publisher: "CD Projekt",
    releaseDate: "2020-12-10",
    platforms: ["PC", "Steam"],
    genres: ["RPG", "Action"]
  },
  {
    id: 2,
    title: "Elden Ring",
    description: "An action RPG set in a vast fantasy world",
    image: "https://via.placeholder.com/300x200?text=Elden+Ring",
    rating: 4.8,
    price: 59.99,
    developer: "FromSoftware",
    publisher: "Bandai Namco",
    releaseDate: "2022-02-25",
    platforms: ["PC", "Steam"],
    genres: ["Action", "RPG"]
  },
  {
    id: 3,
    title: "Baldur's Gate 3",
    description: "A next-generation RPG set in the world of Dungeons & Dragons",
    image: "https://via.placeholder.com/300x200?text=Baldur's+Gate+3",
    rating: 4.9,
    price: 59.99,
    developer: "Larian Studios",
    publisher: "Larian Studios",
    releaseDate: "2023-08-03",
    platforms: ["PC", "Steam"],
    genres: ["RPG", "Strategy"]
  }
];

const searchGames = async (
  _event: Electron.IpcMainInvokeEvent,
  payload: CatalogueSearchPayload,
  take: number,
  skip: number
) => {
  try {
    return await HydraApi.post(
      "/catalogue/search",
      { ...payload, take, skip },
      { needsAuth: false }
    );
  } catch (error) {
    // Return mock data when backend is not available
    return {
      edges: mockGames.slice(skip, skip + take),
      count: mockGames.length
    };
  }
};

registerEvent("searchGames", searchGames);
