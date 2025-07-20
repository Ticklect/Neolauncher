from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI()

# Allow CORS for local development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/catalogue/hot")
def get_hot_catalogue(take: int = 12, skip: int = 0):
    return {
        "games": [
            {
                "id": i,
                "title": f"Game {i}",
                "description": f"Description for Game {i}",
                "image": f"https://via.placeholder.com/300x200?text=Game+{i}",
                "rating": 4.5,
                "price": 29.99,
                "developer": f"Developer {i}",
                "publisher": f"Publisher {i}",
                "releaseDate": "2024-01-01",
                "platforms": ["PC", "Steam"],
                "genres": ["Action", "Adventure"]
            }
            for i in range(skip + 1, skip + take + 1)
        ],
        "steamDevelopers": [
            {
                "id": i,
                "name": f"Steam Developer {i}",
                "games": [f"Game {j}" for j in range(1, 4)]
            }
            for i in range(1, 6)
        ]
    }

@app.get("/games/featured")
def get_featured_games():
    return {
        "featured": [
            {
                "id": i,
                "title": f"Featured Game {i}",
                "description": f"Featured description {i}",
                "image": f"https://via.placeholder.com/400x300?text=Featured+{i}",
                "rating": 4.8,
                "price": 39.99,
                "developer": f"Featured Developer {i}",
                "publisher": f"Featured Publisher {i}",
                "releaseDate": "2024-01-01",
                "platforms": ["PC", "Steam"],
                "genres": ["RPG", "Strategy"]
            }
            for i in range(1, 5)
        ]
    }

@app.get("/")
def root():
    return {"message": "Neo Launcher Backend is running!"} 