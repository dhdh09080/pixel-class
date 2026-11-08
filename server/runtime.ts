import 'dotenv/config';
import { loadSecretFiles, validateRuntime } from './config.js';

loadSecretFiles(process.env);
validateRuntime(process.env);
