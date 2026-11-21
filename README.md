# LUNA-SAFE 🌕

**An interactive lunar terrain analysis and rover navigation simulator.**

LUNA-SAFE is a web-based prototype designed to explore how autonomous rovers could navigate the Moon's challenging terrain. It combines terrain visualisation, hazard analysis and pathfinding to simulate the process of finding a safer route across the lunar surface.

The project aims to make lunar rover navigation easier to understand and demonstrate how computational techniques can help support future space exploration missions.

## 🚀 Live Demo

**[Launch LUNA-SAFE](https://luna-safe.netlify.app)**

## What does it do?

- **Lunar Terrain Visualisation:** Explore a simulated lunar surface with terrain features and obstacles.
- **Hazard Analysis:** Simulate the identification of potentially hazardous regions across the terrain.
- **Autonomous Route Planning:** Calculate a route between selected locations using an A* pathfinding algorithm.
- **Mission Simulation:** Experiment with rover navigation and different terrain conditions.
- **Interactive Dashboard:** Visualise navigation and mission information through a web interface.

## How it works

LUNA-SAFE combines terrain simulation, obstacle representation and pathfinding to demonstrate how a rover could navigate a lunar environment.

The current prototype uses procedurally generated terrain, simulated hazard analysis and a locally implemented A* pathfinding algorithm. These components allow users to explore the navigation workflow without requiring actual rover hardware.

## Tech Stack

- React.js
- Vite
- JavaScript
- CSS
- A* Pathfinding Algorithm

## Project Status

LUNA-SAFE is currently a working frontend prototype.

The terrain, hazard analysis and mission environment are simulated. The navigation system currently uses a locally implemented A* algorithm, while hazard detection and terrain analysis are mocked.

Integration with real lunar datasets, AI-based hazard detection and a FastAPI backend are planned as future improvements.

## Future Improvements

- Integration with real lunar terrain datasets from NASA.
- AI-powered rock, crater and terrain hazard detection.
- Backend integration using FastAPI.
- Improved terrain-aware route optimisation.
- Rover energy consumption and mission planning simulation.

## Getting Started

Clone the repository and run the project locally:

```bash
git clone https://github.com/minmon6767/LUNA-SAFE.git
cd LUNA-SAFE
npm install
npm run dev
```

Open the local development URL provided by Vite, usually `http://localhost:5173`.

To create a production build:

```bash
npm run build
```

## Project Structure

```text
LUNA-SAFE/
├── src/
│   ├── components/   # UI and dashboard components
│   ├── pages/        # Application pages
│   ├── services/     # Terrain, API and pathfinding logic
│   └── store.jsx     # Shared application state
├── public/
├── package.json
└── README.md
```

## Why LUNA-SAFE?

Lunar terrain presents challenges that make autonomous navigation difficult. Even a small obstacle or steep slope can affect a rover's movement and mission efficiency.

LUNA-SAFE is an attempt to simulate how intelligent navigation systems could help rovers make better decisions while exploring unfamiliar planetary environments.

---

**Built as a space exploration and autonomous navigation project.** 🌑
