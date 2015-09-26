/*** RandomDevice Z-Way HA module *******************************************

Version: 1.0.0
(c) Maroš Kollár, 2015
-----------------------------------------------------------------------------
Author: maros@k-1.com <maros@k-1.com>
Description:
    Randomly enable/disable devices

******************************************************************************/

// ----------------------------------------------------------------------------
// --- Class definition, inheritance and setup
// ----------------------------------------------------------------------------

function RandomDevice (id, controller) {
    // Call superconstructor first (AutomationModule)
    RandomDevice.super_.call(this, id, controller);
}

inherits(RandomDevice, AutomationModule);

_module = RandomDevice;

// ----------------------------------------------------------------------------
// --- Module RandomDevice initialized
// ----------------------------------------------------------------------------

RandomDevice.prototype.init = function (config) {
    RandomDevice.super_.prototype.init.call(this, config);
    var self=this;
    
    var currentTime = (new Date()).getTime();
    var langFile = self.controller.loadModuleLang("RandomDevice");
    this.timerOff = null;
    
    // Read status from file and init
    this.statusId = "RandomDevice_" + self.id;
    this.status = loadObject(this.statusId);
    if (! this.status ) {
        this.status = { 'mode': false };
    } else if (this.status === true) {
        if (this.status.off > currentTime) {
            self.timerOff = setTimeout(function() {
                self.randomOff();
            },this.status.off);
        }
    }
    
    // Create vdev
    this.vDev = this.controller.devices.create({
        deviceId: "RandomDevice_" + this.id,
        defaults: {
            metrics: {
                level: 'off',
                title: langFile.title,
                icon: "/ZAutomation/api/v1/load/modulemedia/RandomDevice/icon_off.png"
            }
        },
        overlay: {
            deviceType: 'switchBinary'
        },
        handler: function(command, args) {
            var level = command;
            if (level !== 'on') {
                level = 'off';
            }
            if (level ==='off'
                && self.status.mode === true) {
                self.randomOff();
            }
            this.set("metrics:level", level);
            this.set("metrics:icon", "/ZAutomation/api/v1/load/modulemedia/RandomDevice/icon_"+level+".png");
        },
        moduleId: this.id
    });
    
    this.timerRoll = setInterval(function() {
        self.rollDice();
    }, 1000*60);
};

RandomDevice.prototype.rollDice = function () {
    var self=this;
    
    var currentTime = (new Date()).getTime();
    var randomOn = false;
    var devicesConfig = self.config.devices;
    
    if (self.status.mode === true
        && self.status.off < currentTime) {
        self.randomOff();
    }
    
    _.each(devicesConfig,function(deviceId) {
        var deviceObject = self.controller.devices.get(deviceId);
        var deviceLevel  = deviceObject.get('metrics:level');
        if (
            (
                deviceObject.get('deviceType') === 'switchBinary' 
                && deviceLevel === 'off'
            )
            || 
            (
                deviceObject.get('deviceType') === 'switchMultilevel'
                && deviceLevel === 0
            )) {
            if (self.status.mode === true
                && self.status.device === deviceId) {
                self.randomOff();
            }
            return;
        }
        randomOn = true;
    });
    
    // Check any device on
    if (randomOn) {
        return;
    }
    
    
    // Check random device on
    if (self.vDev.get('metrics:level') !== 'on') {
        return;
    }
    
    // Roll dice for trigger
    var randomTrigger = Math.round(Math.random() * 100);
    if (randomTrigger > self.config.probability) {
        return;
    }
    
    // Roll dice for device
    var randomDevice    = Math.round(Math.random() * (devicesConfig.length-1));
    var deviceId        = devicesConfig[randomDevice];
    
    
    // Roll dice for duration
    var interval        = parseInt(self.config.timeTo) - parseInt(self.config.timeFrom);
    var minutes         = Math.round(Math.random() * interval) + parseInt(self.config.timeFrom);
    var deviceObject    = self.controller.devices.get(deviceId);
    var offTime         = currentTime + (minutes * 60 * 1000);
    
    if (! deviceObject) {
        return;
    }
    
    // Turn on device
    console.log('Turning on random device '+deviceObject.id+' for '+minutes+' minutes');
    if (deviceObject.get('deviceType') === 'switchBinary') {
        deviceObject.performCommand('on');
    } else if (deviceObject.get('deviceType') === 'switchMultilevel') {
        deviceObject.performCommand('exact',99);
    } else {
        console.error('Unspported device type '+deviceObject.get('deviceType'));
        return;
    }
    
    if (self.timerOff) {
        clearTimeout(self.timerOff);
    }
    
    self.timerOff = setTimeout(function() {
        self.randomOff();
    },offTime);
    
    self.status = { 
        'mode': true, 
        'device': deviceObject.id,
        'on': currentTime,
        'off': offTime,
        'minutes': minutes
    };
    saveObject(this.statusId,self.status);
};

RandomDevice.prototype.randomOff = function () {
    var self = this;
    
    if (self.status.mode === false) {
        console.error('Random device already off');
        return;
    }
    
    var deviceObject = self.controller.devices.get(self.status.device);
    
    console.log('Turning off random device '+deviceObject.id);
    
    if (deviceObject.get('deviceType') === 'switchBinary') {
        deviceObject.performCommand('off');
    } else if (deviceObject.get('deviceType') === 'switchMultilevel') {
        deviceObject.performCommand('exact',0);
    }
    
    if (self.timerOff) {
        clearTimeout(self.timerOff);
        self.timerOff = null;
    }
    
    self.status = { 'mode': false };
    saveObject(self.statusId,self.status);
};

RandomDevice.prototype.stop = function () {
    var self = this;
    RandomDevice.super_.prototype.stop.call(this);
    
    if (self.timerRoll) {
        clearInterval(self.timerRoll);
    }
    if (self.timerOff) {
        clearTimeout(self.timerOff);
    }
    if (self.vDev) {
        self.controller.devices.remove(self.vDev.id);
        self.vDev = null;
    }
};
