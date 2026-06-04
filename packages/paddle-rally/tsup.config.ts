import { defineConfig } from 'tsup';
import { definePhaserBuild } from '@caputchin/preset-phaser/build';

// Live IIFE bundle (dist/paddle-rally.js) + headless ESM replay bundle (dist/run.js).
// Phaser is bundled into both (it is the engine, not an isolate-provided external).
export default defineConfig(definePhaserBuild({ gameId: 'paddle-rally' }));
