'use strict';

// const suncalc = require('suncalc');
const DataCache = require('./lib/data_cache');
var moment = require('moment');
const http = require('http');

module.exports = homebridge => {
  const Characteristic = homebridge.hap.Characteristic;
  const Service = homebridge.hap.Service;

  class WifiSignalStrength extends Characteristic {
        constructor(accessory) {
            super('Signal strength', 'E863F11A-079E-48FF-8F27-9C2605A29F99');
            this.setProps({
                format: Characteristic.Formats.UINT16,
                unit: Characteristic.Units.PERCENTAGE,
                perms: [
                    Characteristic.Perms.READ,
                    Characteristic.Perms.NOTIFY
                ]
            });
        }
    }
  class DataAge extends Characteristic {
        constructor(accessory) {
            super('Last data received before', 'E863F11A-079E-48FF-8F27-9C2605A29F98');
            this.setProps({
                format: Characteristic.Formats.UINT16,
                unit: Characteristic.Units.SECONDS,
                perms: [
                    Characteristic.Perms.READ,
                    Characteristic.Perms.NOTIFY
                ]
            });
        }
    }

  // Frequency of updates during transition periods.
  const UPDATE_FREQUENCY = 60000; // change necessary

  class LightSensorAccessory {
    constructor(log, config) {
      this.log = log;
      if (!config.jsonURL) {
        throw new Error('Invalid or missing `jsonURL` configuration.');
      }

      this.jsonURL = config.jsonURL;
      this.parsedData = [];
      this.lastReadingTime = moment().unix();
      this.lastSignalStrength = 0;
      this.service = new Service.LightSensor(config.name);

      this.service.addCharacteristic(WifiSignalStrength);
      this.service
        .getCharacteristic(WifiSignalStrength)
        .on('get', this.getSignalStrength.bind(this));

      this.service.addCharacteristic(DataAge);
      this.service
        .getCharacteristic(DataAge)
        .on('get', this.getDataAge.bind(this));

      this.updateAmbientLightLevel();
    }

    getSignalStrength(callback) {
      this.log('I was here.');
      var signalStrengthDB = this.parsedData["wifiSignalStrength"];
      var signalStrengthPerc = signalStrengthDB + 130;
      callback(null,signalStrengthPerc);
    }

    getDataAge(callback) {
      this.log('I was here as well.');
      var dataAge = moment().unix() - this.lastReadingTime;
      callback(null,dataAge);
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
            const parsedData = JSON.parse(rawData);
            this.lastReadingTime = moment().unix();
            this.parsedData = parsedData;
            callback(null, parsedData);
          } catch (error) {
            callback(error, null);
          }
        });
      }).on('error', (error) => {
        callback(error, null);
      });
    }

    updateAmbientLightLevel() {
      var parsedData = [];
      this.loadCurrentSensorData(this.jsonURL, (error, parsedData) => {
        if (!error) {
          var sensorValue = parsedData["sensorValue"];

          var measres = 1000.0 * ((1024.0/sensorValue) - 1.0);
          //var photores = ((sensorValue * 3.3)/1.024)/(3.3*(1.0-sensorValue/1024.0));
          //this.log(photores);
          var lightLevel = Math.pow(10.0,1.33*(5.0 - Math.log10(measres)));
          this.lastReadingTime = moment().unix();

          let msg = "LightSensor: Calculated light density is " + lightLevel + " lx";
          this.log(msg);


          this.service.setCharacteristic(
            Characteristic.CurrentAmbientLightLevel,
            lightLevel);
        }
      });

      setTimeout(this.updateAmbientLightLevel.bind(this), UPDATE_FREQUENCY);
    }

    getServices() {
      return [this.service];
    }
  }

  homebridge.registerAccessory('homebridge-light-sensor', 'LightSensor', LightSensorAccessory);
};
