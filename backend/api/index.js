'use strict';
// Punto de entrada de Vercel (función serverless): exporta la app Express, sin app.listen().
const env = require('../src/config/env');
env.validate();
module.exports = require('../src/app').createApp();
