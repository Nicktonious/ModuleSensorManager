class ClassSensorManager {
    constructor() {
        if (this.Instance) {
            return this.Instance;
        } else {
            ClassSensorManager.prototype.Instance = this;
        }
        this._Devices = [];
        // запуск циклического опроса
        Object.on('sensor-start-polling', (_arg) => {
            let freq = _arg[0];
            if (!this._Interval) this.StartPolling(freq);
        });
        // его остановка
        Object.on('sensor-stop-polling', () => {
            this.StopPolling();
        });
        // сбор метаданных данных о сенсорах
        Object.on('sensor-get-info', () => {
            this.GetSensorsInfo();
        });
        // перенаправление команды актуатору

        Object.on('sensor-write', (_arg) => {
            this.ExecuteCom(_arg);
        });

        //инициализация события о появлении нового устройства
        Object.on('new-device', (device) => {
            this.AddDevice(device);
        });
    }
    get Devices() { return this._Devices; }
    get Sensors() {
        return this._Devices.filter(device => device._Type.toLowerCase() === 'sensor');
    }

    /**
     * @method
     * Добавляет устройство в реестр
     * @param {Object} device 
     */
    AddDevice(device) {
        if ((!this.GetDevice(device.ID)) && device.ID) {
            this._Devices.push(device);
        }
    }
    /**
     * @method
     * @param {string} id 
     * Возвращает устройство с соответствующим id
     * @returns 
     */
    GetDevice(id) {
        return this._Devices.find(dev => dev.ID === id);
    }
    /**
     * Возвращает канал устройства по его id
     * @param {string} chId 
     */
    GetDeviceChannel(chId) {
        let id = chId.split('-');
        let chNum = +id.pop();
        let device = this.GetDevice(id.join('-'));
        if (device) return device.GetChannel(chNum);
        return null;
    }
    /**
     * @method
     * Запускает периодичное считывание данных с сенсоров. Данные, которые не обновились с момента последнего обхода, пропускаются
     * @param {Number} _freq - частота опроса 
     */
    StartPolling(_freq) {
        const freq = _freq || 4;
        if (typeof freq !== 'number' || freq <= 0) return false;

        const valIsEqual = (a, b) => {
            // if (a && b == 0) return true;
            const precision = 0.05;
            return a === b || Math.abs(a - b) <= a * precision;
        };
        let data_cache = {};

        this._Interval = setInterval(() => {

            let data_package = { };

            this.Sensors.map(sensor => {
                // перебор каналов
                sensor._Channels.forEach(ch => {
                    if (!valIsEqual(ch.Value, data_cache[ch.ID])) {
                        data_package[ch.ID] = ch.Value;
                        data_cache[ch.ID] = ch.Value;
                    }
                });
            });

            if (Object.keys(data_package).length) this.SendData(data_package);
            // console.log('DEBUG>>iteration is done');

        }, 1 / freq * 1000);
        return true;

    }
    /**
     * @method
     * Прекращает периодический опрос датчиков
     */
    StopPolling() {
        if (this._Interval) clearInterval(this._Interval);
        this._Interval = null;
    }

    /**
     * @method
     * Собирает и возвращает информацию о датчиках
     * @param {[String]} idArr - массив id
     */
    GetSensorsInfo() {
        let data_package = {
            MetaData: 'Info',
            Value: []
        };
        // перебор устройств
        this.Devices.forEach(device => {
            let sensor_info = {};
            // сбор свойств сенсоров
            let propsList = (device._Type === 'sensor') ? [
                '_Name',
                '_Type',
                '_QuantityChannel',
                '_ChannelNames',
                '_MinRange',
                '_MaxRange',
                '_TypeInSignal',
                '_TypeOutSignal',
                '_BusTypes',
                '_ManufacturingData',
                '_IsChUsed',
                '_IsAvailable'
            ] : (device._Type === 'actuator') ? [ 
                '_Name',
                '_Type',
                '_QuantityChannel',
                '_ChannelNames',
                '_MinRange',
                '_MaxRange',
                '_TypeInSignals',
                '_BusTypes',
                '_ManufacturingData',
                '_IsChOn',
                '_Offsets'
            ] : [];
            propsList.forEach(prop => {
                sensor_info[prop] = device[prop];
            });
            data_package.Value.push(sensor_info);
        });

        this.SendData(data_package);
    }
    /**
     * @method
     * Выполняет рассылку данных, собранных с сенсоров
     * @param {Object} dataPackage - объект типа { channel_id: channel_value }
     */
    SendData(dataPackage) {
        // console.log('DEBUG>>data sent');
        Object.emit('sensor-data', dataPackage);
    }
    /**
     * @method
     * Отправляет собранные метаданные о датчиках и актуаторах
     * @param {[Object]} infoArray - массив типа [{ID, _Name, Type, ...}, {...}, {...}]
     */
    SendInfo(infoArray) {
        // console.log('DEBUG>>data sent');
        Object.emit('sensor-info', infoArray);
    }
    /**
     * @method 
     * Вызывает команду актуатора
     * @param {Array} arg - массив типа [id, method/task_name, ...restArgs]
     */
    ExecuteCom(arg) {
        let id = arg.shift();
        let methodName = arg.shift();

        let device = this.GetDeviceChannel(id);
        if (!device) return false; 
        if (typeof device[methodName] === 'function') {
            device[methodName].apply(device, arg);
            return true;
        }
        return false;
    }
}

exports = ClassSensorManager;