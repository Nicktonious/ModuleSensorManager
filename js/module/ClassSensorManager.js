class SensorManager {
    constructor() {
        if (this.Instance) {
            return this.Instance;
        } else {
            SensorManager.prototype.Instance = this;
        }
        this._Devices = [];
        this._InfoList = [
            '_Name',
            '_Type',
            '_QuantityChannel',
            '_ChannelNames',
            '_TypeInSignal',
            '_TypeOutSignal',
            '_BusTypes',
            '_ManufacturingData'
        ];
        //инициализаця события о появлени нового устройства
        Object.on('new-device', (device) => {
            this.AddDevice(device);
        });
    }
    get Devices() { return this._Devices; }
    get Sensors() { return this._Devices.filter(device => device._Type.toLowerCase() === 'sensor'); }
    get Actuators() { return this._Devices.filter(device => device._Type.toLowerCase() === 'actuator'); }

    /**
     * @method
     * Добавляет устройство в реестр
     * @param {Object} device 
     */
    AddDevice(device) {
        if ((!this.GetDevice(device.Id)) && device.Id) {
            this._Devices.push(device);
        }
    }

    GetDevice(id) {
        return this._Devices.find(dev => dev.Id === id);
    }
    /**
     * @method
     * Запускает периодичное считывание данных с сенсоров. Данные, которые не обновлились с момента последнего обхода, пропускаются
     * @param {Number} _freq - частота опроса 
     */
    StartCycle(_freq) {
        const freq = _freq || 4;
        if (typeof freq !== 'number' || freq <= 0) throw new Error('Invalid arg');

        const valIsEqual = (a, b) => {
            if (a && b == 0) return true;
            const precision = 0.05;
            return Math.abs(a - b) <= a * precision;
        }

        this._Interval = setInterval(() => {

            let data_package = {};
            let data_cache = {};
            this.Sensors
            .map(sensor => sensor._Channels
                // перебор каналов
                .forEach(ch => {
                    if (!valIsEqual(ch.Value, data_cache[ch.Id])) {
                        data_package[ch.Id] = ch.Value;
                        data_cache[ch.Id] = ch.Value;
                    }
                }
            ));

            this.SendSensorData(data_package);

        }, 1 / freq)
    }
    /**
     * @method
     * Выполняет рассылку данных, собранных с сенсоров
     * @param {Object} dataPackage - объект типа { channel_id: channel_value }
     */
    SendSensorData(dataPackage) {
        Object.emit('sensor-read', dataPackage);
    }
    /**
     * @method
     * Собирает и возвращает информацию о датчиках
     * @param {[String]} idArr - массив id
     */
    GetSensorInfo(idArr) {
        // TODO: make sure that isArray() method is available in espruino
        if (!idArr.isArray()) throw new Error();
        idArr.forEach(id => {
            if (typeof id !== 'string') throw new Error();
        });

        let data_package = {};

        idArr.forEach(id => {
            let sensor = this.GetDevice(id);
            if (sensor) {
                data_package[id] = {}; 
                this._InfoList.forEach(prop => {
                    data_package[id][prop] = sensor[prop];
                });
            } else {
                data_package[id] = null;
            }
        });

        this.SendSensorData(data_package);
    }
}