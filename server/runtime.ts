import 'dotenv/config';
import { loadSecretFiles, validateRuntime } from './config.js';
import { isRailway, admitRailwayDatabase } from './railway-volume.mjs';

loadSecretFiles(process.env);
validateRuntime(process.env);
if (isRailway(process.env)) admitRailwayDatabase(process.env);
