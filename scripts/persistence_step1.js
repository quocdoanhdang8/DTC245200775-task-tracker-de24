#!/usr/bin/env node
const { fork } = require("node:child_process");
const path = require("node:path");

const child = fork(path.resolve(__dirname, "test_persistence.js"), ["--step1"]);
child.on("exit", (code) => process.exit(code || 0));
