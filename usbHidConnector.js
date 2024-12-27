//
// Copyright 2024 : Pragmatic Audio
//
// Declare UsbHIDConnector and attach it to the global window object
window.UsbHIDConnector = (function() {
    let config = {};
    let devices = [];
    let currentDevice = null;

    const deviceHandlers = {
        "FiiO": {
            "JadeAudio JA11": fiioUsbHID,
            "FIIO KA17": fiioUsbHID,
            "FIIO Q7": fiioUsbHID,
            "FIIO BTR13": fiioUsbHID,
            "FIIO KA15": fiioUsbHID
        }
        // Add more manufacturers and models as needed
    };

    const isWebHIDSupported = () => 'hid' in navigator;

    const getDeviceConnected = async () => {
        try {
            const vendorToManufacturer = [
                { vendorId: 10610, manufacturer: "FiiO" } // Add more as needed
            ];

            // Request devices matching the filters
            const selectedDevices = await navigator.hid.requestDevice({ filters: vendorToManufacturer });

            if (selectedDevices.length > 0) {
                const rawDevice = selectedDevices[0];
                const manufacturer = vendorToManufacturer[0].manufacturer;
                const model = rawDevice.productName;

                // Check if already connected
                const existingDevice = devices.find(d => d.rawDevice === rawDevice);
                if (existingDevice) {
                    console.log("Device already connected:", existingDevice.model);
                    currentDevice = existingDevice;
                    return currentDevice;
                }

                // Open the device if not already open
                if (!rawDevice.opened) {
                    await rawDevice.open();
                }

                currentDevice = {
                    rawDevice: rawDevice,
                    manufacturer: manufacturer,
                    model: model,
                    handler: getDeviceHandler(manufacturer, model),
                    deviceDetails: getModelConfig(rawDevice)
                };

                if (currentDevice.handler) {
                    await currentDevice.handler.connect(rawDevice);
                } else {
                    console.error(`No handler found for ${manufacturer} ${model}`);
                    return null;
                }

                devices.push(currentDevice);
                return currentDevice;
            } else {
                console.log("No device found.");
                return null;
            }
        } catch (error) {
            console.error("Failed to connect to HID device:", error);
            return null;
        }
    };

    const disconnectDevice = async () => {
        if (currentDevice && currentDevice.rawDevice) {
            try {
                await currentDevice.rawDevice.close();
                console.log("Device disconnected:", currentDevice.model);
                devices = devices.filter(d => d !== currentDevice);
                currentDevice = null;
            } catch (error) {
                console.error("Failed to disconnect device:", error);
            }
        }
    };

    const pushToDevice = async (device, slot, preamp, filters) => {
        if (device && device.handler) {
            await device.handler.pushToDevice(device.rawDevice, slot, preamp, filters);
        } else {
            console.error("No device handler available for pushing.");
        }
    };

    // Helper Function to Get Available 'Custom' Slots Based on the Device that we can write too
    const  getAvailableSlots = async (device) => {
        return device.deviceDetails.availableSlots;
    };

    const getCurrentSlot = async (device) => {
        if (device && device.handler) {
            return await device.handler.getCurrentSlot(device.rawDevice)
        }{
            console.error("No device handler available for querying");
            return -2;
        }
    };

    const pullFromDevice = async (device, slot) => {
        if (device && device.handler) {
            return await device.handler.pullFromDevice(device.rawDevice, slot);
        } else {
            console.error("No device handler available for pulling.");
            return { filters: [], deviceDetails: {} };
        }
    };

    const enablePEQ = async (device, enabled, slotId) => {
        if (device && device.handler) {
            return await device.handler.enablePEQ(device.rawDevice, enabled, slotId);
        } else {
            console.error("No device handler available for enabling.");
        }
    };


    const getDeviceHandler = (manufacturer, model) => {
        return deviceHandlers[manufacturer]?.[model] || null;
    };

    const getCurrentDevice = () => currentDevice;

    return {
        config,
        isWebHIDSupported,
        getDeviceConnected,
        getAvailableSlots,
        disconnectDevice,
        pushToDevice,
        pullFromDevice,
        getCurrentDevice,
        getCurrentSlot,
        enablePEQ,
    };
})();
