# AI Calorie Assistant

An Obsidian plugin for turning a meal photo or text description into an editable nutrition estimate and a Markdown food log. A personal product prototype written in JavaScript.

## Overview

The plugin keeps meal estimation, corrections and note export in one Obsidian panel. Nutrition estimates come from a separately configured HTTP service; this repository contains the plugin client, **not the AI backend or a trained model**.

## Motivation

Recording a meal often means switching between an image, a nutrition tool and a diary. This project explores a shorter workflow inside an existing note-taking environment. No measured time savings, recognition accuracy or user adoption are claimed.

## Features

- Select a meal image and send it to a configured Worker for estimation.
- Request estimates from a dish name and description; the client tries several request formats.
- Send text corrections to the service and adjust portion weight.
- Display calories, protein, fat and carbohydrates per 100 g and for a portion.
- Export meal blocks and daily totals to Markdown notes; optionally save photos in the vault.
- Configure daily targets, history length and export behaviour; restore the last local session.
- Recalculate note tables and remove meal entries through the implemented controls.

These are client-side behaviours visible in the code. Remote estimation requires a compatible service and has not been validated against a bundled backend.

## How it works

1. `main.js` registers an Obsidian view, commands, settings and vault event handlers.
2. The panel encodes a selected image as base64 or builds a text/correction request.
3. `callWorker` sends JSON using `fetch` to the configured URL.
4. The response is interpreted as nutrition data; local helpers calculate portion totals.
5. Obsidian's vault API writes Markdown and, optionally, the photo.

The plugin stores settings and the last session in local `data.json`. Meal text and photos are sent to the configured service when remote estimation is used. Service credentials belong on the server; the current client has no authentication-header setting.

### Client API contract

The service must accept `POST` requests with `Content-Type: application/json`:

| Action | Payload used by the client |
|---|---|
| Photo | `{"image_b64":"<base64>","mime":"image/jpeg"}` |
| Text (first attempted format) | `{"mode":"text","item":"Oatmeal","description":"With milk","language":"ru"}` |
| Correction | `{"previous_json":{},"instruction":"Change the ingredients","portion_g":200}` |
| Finalize | `{"mode":"final","previous_json":{}}` |

The UI expects fields such as `item`, `per_100g` (`calories`, `proteins`, `fats`, `carbohydrates`), `portion_g`, `portion_totals`, `message` and optionally `markdown`. This is inferred from the client, not a versioned server specification. A failure can be returned as `{"error":"Explanation"}`. The service must allow requests from the Obsidian environment. No provider, model, prompt or deployment instructions can be verified from this repository.

## Project structure

```text
main.js                 Active plugin entry point: UI, CSS, HTTP, note handling
manifest.json           Obsidian plugin identity and minimum version
assets/README.md        Instructions for adding real screenshots
.gitignore              Excludes local sessions, secrets and generated files
```

Previously committed empty `services/` and `ui/` placeholders and unused helper copies were not connected to `main.js`; they have been removed from the current tree. Their history remains available in Git.

## Tech stack

JavaScript (CommonJS), Obsidian Plugin API, embedded CSS, browser File/base64 APIs, `fetch`, Markdown and JSON. The endpoint is intended for a Cloudflare Worker, whose implementation is not included. There is no Python, npm dependency installation or build step in this client.

## Installation / Run

1. Install Obsidian **1.4.0 or later** (the version declared by `manifest.json`).
2. Create a test vault and the directory `.obsidian/plugins/calorie-assistant/` inside it.
3. Copy `main.js` and `manifest.json` into that directory.
4. Enable community plugins for that vault, reload Obsidian and enable **Calorie Assistant**.
5. In the plugin settings, enter the URL of a compatible service you control. The default is empty; remote calls fail with a configuration message until it is set.
6. Use the command **Open Calorie Assistant** or its ribbon icon.

The panel can be installed locally, but end-to-end AI analysis cannot be reproduced from this repository alone. It is not a standalone web page and cannot run with `node main.js`.

## Example workflow

Open a test note, select a non-sensitive meal photo, and request an estimate through your configured service. Review the returned values, set the portion in grams, optionally send a correction, and export the result. Inspect the created meal block and daily table in the active note. No example calorie values are supplied as verified nutrition facts.

## Current limitations

- Backend code, credentials, model choice and recognition evaluation are absent.
- Estimates require review; neither nutritional accuracy nor clinical suitability has been measured.
- `main.js` is a roughly 2,200-line module mixing UI, parsing and persistence.
- Response parsing is permissive and tries multiple text request formats; schema validation, HTTP-status handling, timeout and retry policy need work.
- Note updates depend on the expected Markdown layout. Test changes in a disposable vault first.
- Timestamps use `Europe/Moscow`; mobile support is declared in the manifest but has not been verified across devices.
- No automated integration suite or real screenshots are included. Local sessions removed from the current tree remain in older Git commits.

## Possible improvements

1. Publish a minimal backend contract and reproducible service implementation with server-side credentials.
2. Add tests for response parsing and Markdown round trips, then extract CSS, Worker access, nutrition helpers, view and note persistence into small modules. Do this incrementally.
3. Add explicit estimate uncertainty, request errors and user-controlled history retention.
4. With opt-in instrumentation, evaluate completion rate and time from input to saved note; there are no collected product metrics in this repository.

## Screenshots

See [assets/README.md](assets/README.md) for two suggested screenshots. Add actual captures after running the plugin; mockups should not be presented as evidence of a working integration.
