//
// Copyright 2024 : Pragmatic Audio
//
// Define the shared logic for JadeAudio / FiiO devices - Each manufacturer will have slightly
// different code so best to each have a separate 'module'

const PEQ_FILTER_COUNT=  24;
const PEQ_GLOBAL_GAIN = 23;
const PEQ_FILTER_PARAMS = 21;
const PEQ_PRESET_SWITCH = 22;


window.fiioUsbHID = {
    connect: async function(device) {
        try {
            await device.open();
            console.log("FiiO Device connected");
        } catch (error) {
            console.error("Failed to connect to FiiO Device:", error);
        }
    },
    pushToDevice: async function(device, slot, preamp, filters) {
        try {
            async function setPeqParams(device, slot, fc, gain, q, filterType) {

                // Convert frequency to high and low bytes
                const [frequencyHigh, frequencyLow] = splitUnsignedValue(fc);

                // Convert gain to high and low bytes
                const gainValue = Math.round(gain * 10); // Multiply gain by 10 to restore original scaling
                const [gainHigh, gainLow] = splitSignedValue(gainValue);
                // Convert qFactor to high and low bytes
                const qFactorValue = Math.round(q * 100); // Multiply q by 100 to restore original scaling
                const [qFactorHigh, qFactorLow] = splitUnsignedValue(qFactorValue);

                const packet = [170, 10, 0, 0, PEQ_FILTER_PARAMS, 8, slot, gainHigh, gainLow, frequencyHigh, frequencyLow, qFactorHigh, qFactorLow, filterType, 0, 238];
                const data = new Uint8Array(packet);
                const reportId = device.collections[0].outputReports[0].reportId;
                console.log("setPeqParams() reportId", reportId, "Send data:", data);
                await device.sendReport(reportId, data);
            }

            async function setPresetPeq(device, presetId) {

                const packet = [170, 10, 0, 0, PEQ_PRESET_SWITCH, 1, presetId, 0, 238];
                const data = new Uint8Array(packet);
                const reportId = device.collections[0].outputReports[0].reportId;
                console.log("setPresetPeq() reportId", reportId, "Send data:", data);
                await device.sendReport(reportId, data);
            }

            async function setGlobalGain(device, gain) {
                let globalGain = Math.round(gain * 100); // Multiply by 100 and round

                const gainBytes = toBytePair(globalGain);
                const packet = [170, 10, 0, 0, PEQ_GLOBAL_GAIN, 2, gainBytes[0], gainBytes[1], 0, 238];
                const data = new Uint8Array(packet);
                const reportId = device.collections[0].outputReports[0].reportId;
                console.log("setGlobalGain() reportId", reportId, "Send data:", data);
                await device.sendReport(reportId, data);
            }

            async function setPeqCounter(device, counter) {

                const packet = [170, 10, 0, 0, PEQ_FILTER_COUNT, 1, counter, 0, 238];
                const data = new Uint8Array(packet);
                const reportId = device.collections[0].outputReports[0].reportId;
                console.log("setSavePeq() reportId", reportId, "Send data:", data);
                await device.sendReport(reportId, data);
            }

            function convertFromFilterType(filterType) {
                switch (filterType) {
                    case "PK":
                        return 0
                    case "LSQ":
                        return 1
                    case "HSQ":
                        return 2
                    default:
                        return 0
                }
            }


            setGlobalGain(device, preamp );

            let maxFilters = getModelConfig(device).maxFilters;
            let maxFiltersToUse = filters.length > maxFilters ? maxFilters : filters.length;
            setPeqCounter(device, maxFiltersToUse);

            for (filterIdx = 0; filterIdx < maxFiltersToUse; filterIdx++) {
                setPeqParams(device, filterIdx,
                    filters[filterIdx].freq, filters[filterIdx].gain,
                    filters[filterIdx].q, convertFromFilterType(filters[filterIdx].type));
            }

        } catch (error) {
            console.error("Failed to push data to FiiO Device:", error);
        }
    },
    pullFromDevice: async function(device, slot) {
        let filters = []; // Array to accumulate filter settings
        let peqCount = 0;
        let globalGain = 0;
        let filtersPopulated = false;

        console.log("Requested EQ profile data from the device.");

        // Handle the input report when data is received from the device
        device.oninputreport = async (event) => {
            console.log("oninputreport event:", event);
            const data = new Uint8Array(event.data.buffer);
            console.log("Data received:", data);

            if (data.length > 0) {
                parseHIDInput(data);
            }
        }

        // Function to parse the input data
        function parseHIDInput(data) {
            if (data[0] == 187 && data[1] == 11) {
                switch (data[4]) {
                    case PEQ_FILTER_COUNT:
                        handlePeqCounter(data);
                        break;
                    case PEQ_FILTER_PARAMS:
                        handlePeqParams(data);
                        break;
                    case PEQ_GLOBAL_GAIN:
                        handleGlobalGain(data);
                        break;
                    case PEQ_PRESET_SWITCH:
                        handleEqPreset(data[6]);
                        break;
                    default:
                        console.log("Unhandled data type.");
                }
            }

            let hexString = data.reduce((str, byte) => str + byte.toString(16).padStart(2, "0").toUpperCase() + " ", "");
            console.log("hexstr=", hexString);
        }

        function getGlobalGain(device) {
            const packet = [187, 11, 0, 0, PEQ_GLOBAL_GAIN, 0, 0, 238];
            const data = new Uint8Array(packet);
            console.log("getGlobalGain() Send data:", data);
            const reportId = device.collections[0].outputReports[0].reportId;
            device.sendReport(reportId, data);
        }

        function getPeqCounter(device) {
            const packet = [187, 11, 0, 0, PEQ_FILTER_COUNT, 0, 0, 238];
            const data = new Uint8Array(packet);
            console.log("getPeqCounter() Send data:", data);
            const reportId = device.collections[0].outputReports[0].reportId;
            device.sendReport(reportId, data);
        }

        function getPeqParams(device, slotId) {
            const packet = [187, 11, 0, 0, PEQ_FILTER_PARAMS, 1, slotId, 0, 238];
            const data = new Uint8Array(packet);
            console.log("getPeqParams() Send data:", data);
            const reportId = device.collections[0].outputReports[0].reportId;
            device.sendReport(reportId, data);
        }

        function handleGlobalGain(data) {
            globalGain = combineBytes(data[7], data[6]) / 100;
        }

        function handlePeqCounter(data) {
            peqCount = data[6];
            console.log("***********oninputreport peq counter=", peqCount);
            if (peqCount > 0) {
                processPeqCount();
            }
        }

        function handleEqPreset(value) {
            // Handle other types of data
            console.log("EQ Preset: ", value);
        }

        function processPeqCount() {
            console.log("PEQ Counter:", peqCount);

            // Fetch individual PEQ settings based on count
            for (let i = 0; i < peqCount; i++) {
                getPeqParams(device, i);
            }
        }

        function convertToFilterType(datum) {
            switch (datum) {
                case 0:
                    return "PK"
                case 1:
                    return "LSQ"
                case 2:
                    return "HSQ"
                default:
                    return "PK"
            }
        }

        function handlePeqParams(data) {
            // Extract filter details and store them in the filters array
            const slot = data[6];
            const gain = signedCombine(data[7], data[8]) / 10;
            const frequency = (data[9] << 8) | data[10];
            const qFactor = ((data[11] << 8) | data[12]) / 100 || 1;
            const filterType = convertToFilterType(data[13]);

            console.log("Filter Details - Gain: ", gain, " Frequency: ", frequency, " Q: ", qFactor, " Type: ", filterType);

            // Store the filter information
            updateFilterAtIndex(filters, slot, {
                type: filterType,
                freq: frequency,
                q: qFactor,
                gain: gain,
                disabled: false // Adjust this depending on your logic
            });

            if (filters.length >= peqCount) {
                filtersPopulated = true; // Mark filters as fully populated
            }
        }

        function updateFilterAtIndex(filters, index, value) {
            // Check if the index is greater than or equal to the current length of the array
            if (index >= filters.length) {
                // Expand the array by pushing `undefined` or another default value
                filters.length = index + 1; // Set the length to the new index
            }
            // Update the specific index with the new value
            filters[index] = value;
        }

        // Promise that resolves when filters are populated or times out after 10 seconds
        const waitForFilters = new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                if (!filtersPopulated) {
                    console.log("Timeout reached before filters were fully populated.");
                }
                resolve(filters); // Return filters even if timeout occurs
            }, 10000); // 10 seconds timeout

            // Polling to check if filters are populated
            const checkFilters = setInterval(() => {
                if (filtersPopulated) {
                    clearTimeout(timeout); // Clear timeout if filters are populated
                    clearInterval(checkFilters); // Stop polling
                    resolve(filters); // Return the populated filters
                }
            }, 100); // Poll every 100ms
        });
        filters.length = 0; // Make sure we have no filters

        // Start the process by requesting the PEQ counter and global gain
        getPeqCounter(device);
        getGlobalGain(device);

        // Wait for filters to be populated or timeout
        return await waitForFilters;
    }
};

function toBytePair(value) {
    return [
        value & 0xFF,        // Least Significant Byte
        (value & 0xFF00) >> 8  // Most Significant Byte
    ];
}

function combineBytes(lowByte, highByte) {
    return (highByte << 8) | lowByte;
}

function signedCombine(highByte, lowByte) {
    const combined = (highByte << 8) | lowByte;
    return combined > 32767 ? combined - 65536 : combined;
}

// Function to split a signed 16-bit integer into two bytes
function splitSignedValue(value) {
    let signedValue = value < 0 ? value + 65536 : value; // Convert signed value to unsigned 16-bit
    const highByte = (signedValue >> 8) & 0xFF; // Extract the high byte
    const lowByte = signedValue & 0xFF;         // Extract the low byte
    return [highByte, lowByte];
}

// Function to split an unsigned 16-bit integer (for frequency and qFactor)
function splitUnsignedValue(value) {
    const highByte = (value >> 8) & 0xFF; // Extract the high byte
    const lowByte = value & 0xFF;         // Extract the low byte
    return [highByte, lowByte];
}

function getModelConfig(device) {
    // Assuming `device` is a string representing the device model
    const configuration = modelConfiguration[device];

    // Check if configuration exists for the given device
    if (configuration) {
        return configuration;
    } else {
        return modelConfiguration["default"];
    }
}

let modelConfiguration = {
    "default": {minGain: -12, maxGain: 12, maxFilters: 5},
    "FIIO Q7": {minGain: -12, maxGain: 12, maxFilters: 5},
    "FIIO KA17": {minGain: -12, maxGain: 12, maxFilters: 10},
    "JadeAudio JA11": {minGain: -12, maxGain: 12, maxFilters: 5},
    "FIIO BTR13": {minGain: -12, maxGain: 12, maxFilters: 5},
    "FIIO KA15": {minGain: -12, maxGain: 12, maxFilters: 5}
}

