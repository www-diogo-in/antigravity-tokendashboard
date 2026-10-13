# Antigravity IDE Token, CO2e and Cost Dashboard

Native in-editor telemetry extension for **Google Antigravity IDE**. Gain deep real-time visibility into token utilization, reasoning token overhead, prompt caching efficiency, Gemini model pricing, and datacenter carbon footprint (CO₂e) without ever leaving the IDE.

> 🌍 **Part of the #Pub Initiative:**  
> This extension is part of a bigger project in Portugal at [#Pub | Hashtag Pub](https://pub.ong) to bring transparency and sustainability to digital advertising.

## Features

- 🖥️ **Full-Page In-Editor Dashboard Tab**: Run the comprehensive telemetry suite in a dedicated IDE tab (`Antigravity: Open Token & Cost Dashboard`).
- 📊 **Activity Bar & Sidebar Panel**: Dedicated Token Intelligence view container in the left Activity Bar with instant live KPIs and recent sessions.
- ⚡ **Real-Time Status Bar**: Interactive status bar item at the bottom of the IDE showing real-time token volume, total estimated cost, and CO₂e emissions.
- 🌿 **Environmental Impact (CO₂e)**: Carbon footprint metrics for every session and aggregate totals calculated using Google datacenter PUE, clean energy match, and IEA carbon intensity benchmarks.
- 🎯 **Prompt Cache Intelligence**: Track cache hit rates and compute cost savings achieved through Antigravity's context reuse.
- 🤖 **Turn-by-Turn Trajectory Drawer**: Inspect individual prompt turns, system context expansion, and reasoning tokens.
- 🔄 **Autonomous Server Management**: Automatically spawns and monitors the local SQLite analytics daemon (`127.0.0.1:3333`) in the background.

## Commands

- `Antigravity: Open Token & Cost Dashboard` — Opens the dashboard in an editor tab.
- `Antigravity: Refresh Token Telemetry` — Refreshes all metrics and sidebar data.
- `Antigravity: Restart Token Dashboard Server` — Restarts the background analytics daemon.

## Architecture

This extension interacts with local Antigravity session SQLite databases located in `~/.gemini/antigravity-ide/conversations/` and processes protobuf turn frames using `node:sqlite`. Zero cloud uploads or external telemetry tracking; everything remains 100% private and on-device.

## 💡 Inspiration & Credits

This project was inspired by [neuland/tokendashboard-frontend](https://github.com/neuland/tokendashboard-frontend), expanding the concept into a native in-IDE extension with environmental (CO₂e) metrics, turn-by-turn trajectory inspection, and autonomous daemon management.

### 🤖 Author's Note: Built 99% with AI

> **"A note on how this was made:**  
> I am not a professional software developer or programmer. This entire project—from the SQLite reverse-engineering and Protobuf parsing to the custom canvas timeline charts, the in-IDE extension architecture, and the automated packaging—was **99% created with AI** (using Google Antigravity IDE and its agentic pair programming assistant).  
> It stands as a real-world testament to what modern agentic AI can build when guided by an idea, iterative feedback, and pair programming."

