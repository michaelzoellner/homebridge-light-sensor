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

  const UPDATE_FREQUENCY = 60000;
  const UPDATE_FREQUENCY_FAIL = 5000;

  class LightSensorAccessory {
    constructor(log, config) {
      this.log = log;
      if (!config.jsonURL) {
        throw new Error('Invalid or missing `jsonURL` configuration.');
      }

      this.updateFrequency = config["updateFrequency"] || UPDATE_FREQUENCY;
      this.updateFrequencyFail = config["updateFrequencyFail"] || UPDATE_FREQUENCY_FAIL;
      this.jsonURL = config.jsonURL;
      this.parsedData = [];
      this.timeoutObj = [];
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
      var signalStrengthDB = this.parsedData["wifiSignalStrength"];
      var signalStrengthPerc = signalStrengthDB + 130;
      this.log.debug('Signal strength is %s dB or %s %.', signalStrengthDB, signalStrengthPerc);
      callback(null,signalStrengthPerc);
    }

    getDataAge(callback) {
      var dataAge = moment().unix() - this.lastReadingTime;
      this.log.debug('Last data was received %s s ago.', dataAge);
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
      if (this.timeoutObj) {
        clearTimeout(this.timeoutObj);
      }

      var parsedData = [];
      this.loadCurrentSensorData(this.jsonURL, (error, parsedData) => {
        if (error) {
          setTimeout(this.updateAmbientLightLevel.bind(this), this.updateFrequencyFail);
          this.service.getCharacteristic(DataAge).updateValue(this.getDataAge.bind(this));
        } else {
          var sensorValue = parsedData["sensorValue"];

          var measres = 1000.0 * ((1024.0/sensorValue) - 1.0);
          //var photores = ((sensorValue * 3.3)/1.024)/(3.3*(1.0-sensorValue/1024.0));
          //this.log(photores);
          var lightLevel = Math.pow(10.0,1.33*(5.0 - Math.log10(measres)));
          this.lastReadingTime = moment().unix();

          let msg = "LightSensor: Calculated light density is " + lightLevel + " lx";
          this.log.debug(msg);


          this.service.setCharacteristic(
            Characteristic.CurrentAmbientLightLevel,
            lightLevel);
          this.getSignalStrength((error,sigstrength) => {
            if (error) {
              this.service.getCharacteristic(WifiSignalStrength).updateValue(0);
            } else {
              this.service.getCharacteristic(WifiSignalStrength).updateValue(sigstrength);
            }
          });
          // this.service.getCharacteristic(WifiSignalStrength).updateValue(this.getSignalStrength.bind(this));
          this.getDataAge((error,datage) => {
            if (error) {
              this.service.getCharacteristic(DataAge).updateValue(9999);
            } else {
              this.service.getCharacteristic(DataAge).updateValue(datage);
            }
          });

          this.timeoutObj = setTimeout(this.updateAmbientLightLevel.bind(this), this.updateFrequency);
          return
        }
      });
    }

    getServices() {
      return [this.service];
    }
  }

  homebridge.registerAccessory('homebridge-light-sensor', 'LightSensor', LightSensorAccessory);
};
