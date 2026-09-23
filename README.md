# AI Urban Strategy Copilot

Minimal HackAlem project scaffold for the case **«Аким на 5 часов»**.

## Team roles

- `frontend/` — UI, scenario selection, charts, AI Advisor interface.
- `backend/` — FastAPI endpoints and integration.
- `ai/` — Supervisor Agent, deterministic validator/simulator/optimizer and agent tools.

## Core flow

`Frontend -> Backend -> Supervisor Agent -> Tools -> Validator/Simulator/Optimizer -> Agent -> Backend -> Frontend`

## Main principle

**Numbers are calculated by deterministic code. The LLM chooses actions and explains results.**
