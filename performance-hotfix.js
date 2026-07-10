'use strict';

/**
 * CARLAB CLOUD performance hotfix (reversible preload).
 *
 * Loaded with `node -r ./performance-hotfix.js server.js`.
 * It does not modify business logic. It injects the browser-side request
 * coalescing layer before app.min.js and adds lightweight timing headers.
 */

const fs = require('fs');
const path = require('path');
const { performance } = require('perf_hooks');

// Keep a little more headroom for Render/PostgreSQL while remaining conservative.
if (!process.env.PG_POOL_MAX) process.env.PG_POOL_MAX = '6';

const express = require('express');
const originalStatic = express.static;
const public