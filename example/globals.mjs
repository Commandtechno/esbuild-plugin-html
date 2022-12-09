import { readFileSync } from "fs";

global.__readFile = file => readFileSync(file, "utf8");
