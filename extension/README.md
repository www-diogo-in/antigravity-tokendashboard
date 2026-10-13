# Antigravity Token, Cost & CO₂e Intelligence (In-IDE Extension)

Native in-editor telemetry extension for **Google Antigravity IDE**. Gain deep real-time visibility into token utilization, reasoning token overhead, prompt caching efficiency, Gemini model pricing, and datacenter carbon footprint (CO₂e) without ever leaving the IDE.

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
