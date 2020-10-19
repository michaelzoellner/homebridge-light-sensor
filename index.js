'use strict';

// const suncalc = require('suncalc');
const DataCache = require('./lib/data_cache');
const http = require('http');

module.exports = homebridge => {
  const Characteristic = homebridge.hap.Characteristic;
  const Service = homebridge.hap.Service;

  // Frequency of updates during transition periods.
  const UPDATE_FREQUENCY = 10000; // change necessary

  class LightSensorAccessory {
    constructor(log, config) {
      this.log = log;
      if (!config.jsonURL) {
        throw new Error('Invalid or missing `jsonURL` configuration.');
      }

      this.jsonURL = config.jsonURL;
      this.service = new Service.LightSensor(config.name);
      this.updateAmbientLightLevel();
    }

    loadCurrentSensorData(jsonURL, callback) {

      http.get(jsonURL, (res) => {
        const { statusCode } = res;
        const contentType = res.headers['content-type'];

        let error;
        if (statusCode !== 200) {
          error = new Error('Request Failed.\n' +
          `Status Code: ${statusCode}`);
        } else if (!/^application\/json/.test(contentType)) {
          error = new Error('Invalid content-type.\n' +
          `Expected application/json but received ${contentType}`);
        }
        if (error) {
          res.resume();
          callback(error, null);
          return;
        }

        res.setEncoding('utf8');
        let rawData = '';
        let sensorValue = 0.0;
        res.on('data', (chunk) => { rawData += chunk; });
        res.on('end', () => {
          try {
            rawData = rawData.substring(rawData.indexOf("=") + 1);
            rawData = rawData.split(' ')[0];
            sensorValue = parseFloat(rawData)
            callback(null, sensorValue);
          } catch (error) {
            callback(error, null);
          }
        });
      }).on('error', (error) => {
        callback(error, null);
      });
    }

    updateAmbientLightLevel() {
      var sensorValue = 0.0;
      this.loadCurrentSensorData(this.jsonURL, (error, sensorValue) => {
        if (error) {
          return;
        }

        var measres = 1000.0 * ((1024.0/sensorValue) - 1.0);
        //var photores = ((sensorValue * 3.3)/1.024)/(3.3*(1.0-sensorValue/1024.0));
        //this.log(photores);
        this.log("LightSensor: Measured resistance ");
        this.log(measres);
        var lightLevel = Math.pow(10.0,1.33*(5.0 - Math.log10(measres)));
        this.log("LightSensor: Calculated light density ");
        this.log(lightLevel);


        this.service.setCharacteristic(
          Characteristic.CurrentAmbientLightLevel,
          lightLevel);

      });

      setTimeout(this.updateAmbientLightLevel.bind(this), UPDATE_FREQUENCY);
    }

    getServices() {
      return [this.service];
    }
  }

  homebridge.registerAccessory('homebridge-light-sensor', 'LightSensor', LightSensorAccessory);
};
