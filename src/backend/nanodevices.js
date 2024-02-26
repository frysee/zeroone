import { SerialPort } from 'serialport';


const NANO_PRODUCT_ID = '7523';
const NANO_VENDOR_ID = '1a86';
const NANO_BAUD_RATE = 115200;


const nanodevices = {

    all_nano_devices: {},
    connected_nano_devices: {},

    _list() {
        let p = new Promise();
        SerialPort.list().then((ports, err) => {
            if (err) {
                p.reject(err); // TODO format for errors?
            }
            else {
                console.log('ports', ports)
                let found_nano_devices = []
                for (let port of ports) {
                    if (port.productId === NANO_PRODUCT_ID && port.vendorId === NANO_VENDOR_ID) {
                        found_nano_devices.push(port.serialNumber);
                        if (this.all_nano_devices[port.serialNumber] === undefined) {
                            this.all_nano_devices[port.serialNumber] = port;
                            this.emit('nanodevices:device-attached', { id: port.serialNumber });
                        }
                    }
                }
                p.resolve(found_nano_devices);
                for (let serialNumber in this.all_nano_devices) {
                    if (found_nano_devices.indexOf(serialNumber) === -1) {
                        delete this.all_nano_devices[serialNumber];
                        this.emit('nanodevices:device-detached', { id: serialNumber });
                    }
                }
            }
        })
        return p;
    },


    _handle_data(connected_port, data) {
        connected_port.data += data;
        let lines = connected_port.data.split('\n');
        if (lines.length > 1) {
            for (let i = 0; i < lines.length - 1; i++) {
                this.emit('nanodevices:update', connected_port.serialNumber, lines[i]);
            }
            connected_port.data = lines[lines.length - 1];
        }
    },


    list_devices() {
        let result = [];
        for (const [key, value] of Object.entries(this.all_nano_devices)) {
            if (value.serialNumber)
                result.push(key);
        }
        return result;
    },


    async send(deviceid, jsonstr) {
        let connected_port = this.connected_nano_devices[deviceid];
        if (connected_port === undefined) {
            return Promise.reject('Device not connected');
        }
        else {
            connected_port.port.write(jsonstr+'\n');
            return Promise.resolve();
        }
    },


    async connect(deviceid) {
        let p = new Promise();
        let nano_device = this.all_nano_devices[deviceid];
        if (nano_device === undefined) {
            p.reject('Device not attached');
        }
        else {
            let port = new SerialPort(nano_device.path, { baudRate: NANO_BAUD_RATE, autoOpen: false });
            port.on('error', (err) => {
                // forward error to FE
                this.emit('nanodevices:error', { id: nano_device.serialNumber }, err);
            });
            port.on('close', (err) => {
                if (err && err.disconnected) {
                    // forward close to FE
                    this.emit('nanodevices:disconnected', { id: nano_device.serialNumber });
                }
                delete this.connected_nano_devices[nano_device.serialNumber];
            });
            port.on('open', () => {
                p.resolve(nano_device.serialNumber);
                this.connected_nano_devices[nano_device.serialNumber] = { port: port, data: '' };
                this.emit('nanodevices:connected', { id: nano_device.serialNumber });
            });
            port.on('data', (data) => {
                let connected_port = this.connected_nano_devices[nano_device.serialNumber];
                this._handle_data(connected_port, data);
            });
            port.open((err)=>{
                if (err) {
                    p.reject(err);
                }
            });
        }
        return p;
    },


    disconnect(deviceid) {
        let p = new Promise();
        let nano_device = this.all_nano_devices[deviceid];
        if (nano_device === undefined) {
            p.reject('Device not attached');
        }
        else {
            if (this.connected_nano_devices[nano_device.serialNumber] === undefined) {
                p.reject('Device not connected');
            }
            else {
                nano_device.close();
                p.resolve(nano_device.serialNumber);
            }
        }
        return p;
    }

};

export default nanodevices;
