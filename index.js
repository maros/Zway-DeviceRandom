/*** RandomDevice Z-Way HA module *******************************************

Version: 1.02
(c) Maroš Kollár, 2015
-----------------------------------------------------------------------------
Author: Maroš Kollár <maros@k-1.com>
Description:
    Randomly enable/disable devices

******************************************************************************/

// ----------------------------------------------------------------------------
// --- Class definition, inheritance and setup
// ----------------------------------------------------------------------------

function RandomDevice (id, controller) {
    // Call superconstructor first (AutomationModule)
    RandomDevice.super_.call(this, id, controller);
    
    this.timerOff   = undefined;
    this.timerRoll  = undefined;
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
    
    // Create vdev
    this.vDev = this.controller.devices.create({
        deviceId: "RandomDevice_" + this.id,
        defaults: {
            metrics: {
                probeTitle: 'controller',
                level: 'off',
                title: langFile.title,
                icon: "/ZAutomation/api/v1/load/modulemedia/RandomDevice/icon_off.png",
                triggered: false,
                device: null,
                offTime: null,
                onTime: null
            }
        },
        overlay: {
            deviceType: 'switchBinary'
        },
        handler: function(command, args) {
            if (command !== 'on'
                && command !== 'off') {
                return;
            }
            if (command ==='off'
                && self.vDev.get('metrics:triggered') === true) {
                self.randomOff();
            }
            console.log('[RandomDevice] Turning '+command+' random device controller');
            this.set("metrics:level", command);
            this.set("metrics:icon", "/ZAutomation/api/v1/load/modulemedia/RandomDevice/icon_"+command+".png");
        },
        moduleId: this.id
    });
    
    if (this.vDev.get('metrics:triggered') === true) {
        console.log('[RandomDevice] Init found triggered device');
        var offTime = this.vDev.get('metrics:offTime');
        if (offTime > currentTime) {
            self.timerOff = setTimeout(
                _.bind(self.randomOff,self),
                (offTime-currentTime)
            );
        } else {
            self.randomOff();
        }
    } else {
        self.vDev.set("metrics:device",null);
        self.vDev.set("metrics:offTime",null);
        self.vDev.set("metrics:onTime",null);
    }
    
    this.timerRoll = setInterval(
        _.bind(self.rollDice,self), 
        1000*60
    );
};

RandomDevice.prototype.stop = function() {
    var self = this;
    
    if (self.timerRoll) {
        clearInterval(self.timerRoll);
    }
    if (self.timerOff) {
        clearTimeout(self.timerOff);
    }
    if (self.vDev) {
        self.controller.devices.remove(self.vDev.id);
        self.vDev = undefined;
    }
    RandomDevice.super_.prototype.stop.call(this);
};

//----------------------------------------------------------------------------
//--- Module methods
//----------------------------------------------------------------------------

RandomDevice.prototype.rollDice = function () {
    var self=this;
    
    var currentTime = (new Date()).getTime();
    var randomOn = false;
    var devicesConfig = self.config.devices;
    var triggered = self.vDev.get('metrics:triggered');
    
    if (triggered === true
        && self.vDev.get('metrics:offTime') < currentTime) {
        self.randomOff();
        triggered = false;
    }
    
    _.each(devicesConfig,function(deviceId) {
        var deviceObject = self.controller.devices.get(deviceId);
        if (deviceObject == null) {
            return;
        }
        
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
            if (triggered === true
                && self.vDev.get('metrics:device') === deviceId) {
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
    var duration        = (minutes * 60 * 1000);
    var offTime         = currentTime + duration;
    
    if (deviceObject == null) {
        console.error('[RandomDevice] No device for id '+deviceId);
        return;
    }
    
    // Turn on device
    console.log('[RandomDevice] Turning on random device '+deviceObject.id+' for '+minutes+' minutes');
    if (deviceObject.get('deviceType') === 'switchBinary') {
        deviceObject.performCommand('on');
    } else if (deviceObject.get('deviceType') === 'switchMultilevel') {
        deviceObject.performCommand('exact',{ level: 99 });
    } else {
        console.error('[RandomDevice] Unspported device type '+deviceObject.get('deviceType'));
        return;
    }
    
    deviceObject.set('metrics:auto',true);
    
    if (self.timerOff) {
        clearTimeout(self.timerOff);
    }
    
    self.timerOff = setTimeout(
        _.bind(self.randomOff,self),
        duration
    );
    
    self.vDev.set("metrics:icon", "/ZAutomation/api/v1/load/modulemedia/RandomDevice/icon_triggered.png");
    self.vDev.set("metrics:triggered",true);
    self.vDev.set("metrics:device",deviceObject.id);
    self.vDev.set("metrics:offTime",offTime);
    self.vDev.set("metrics:onTime",currentTime);
};

RandomDevice.prototype.randomOff = function() {
    var self = this;
    
    if (self.vDev.get("metrics:triggered") === false) {
        console.error('[RandomDevice] Random device already off');
        return;
    }
    
    var deviceObject = self.controller.devices.get(self.vDev.get("metrics:device"));
    
    console.log('[RandomDevice] Turning off random device '+deviceObject.id);
    
    deviceObject.performCommand('off');
    deviceObject.set('metrics:auto',false);
    
    if (self.timerOff) {
        clearTimeout(self.timerOff);
        self.timerOff = undefined;
    }
    
    var level = self.vDev.get('metrics:level');
    self.vDev.set("metrics:icon", "/ZAutomation/api/v1/load/modulemedia/RandomDevice/icon_"+level+".png");
    self.vDev.set("metrics:triggered",false);
    self.vDev.set("metrics:device",null);
    self.vDev.set("metrics:offTime",null);
    self.vDev.set("metrics:onTime",null);
    
};
