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

        this.InitBuses();
    }
    get Devices() { return this._Devices; }
    get Sensors() {
        return this._Devices.filter(device => device._Type.toLowerCase() === 'sensor');
    }
    /**
     * @method
     * Выполняет инициализацию всех шин, указанных в конфиге к текущей программе.
     */
    InitBuses() {
        let config = Process.GetBusesConfig();

        for (let busName of Object.keys(config)) {
            let opts = config[busName];
            // Приведение строкового представления пинов к получению их объектов                                   
            for (let option of Object.keys(opts)) {
                if (option !== 'bitrate') opts[option] = this.GetPinByStr(opts[option]);
            }
            let busObj;
            if (busName.startsWith('I2C')) busObj = I2Cbus.AddBus(opts);
            if (busName.startsWith('SPI')) busObj = SPIbus.AddBus(opts);
            if (busName.startsWith('UART')) busObj = UARTbus.AddBus(opts);
        }
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
    /**
     * @method
     * Проверяет ID сенсора/актуатора и возвращает булевое значение, указывающее можно ли этот ID использовать.
     * @param {string} _id 
     */
    IsIDUnique(_id) {
        return !Boolean(this.Devices.find(device => device.ID === _id));
    }
    ArePinsAvailable(_pins) {
        for (let i = 0; i < _pins.length; i++) {
            if (this.Devices.find(device => device._Pins.includes(_pins[i]))) return false;
        };
        return true;
    }
    /**
     * @method
     * Инициализирует датчик
     * @param {Object}  opts Объект, хранящий неопределенное множество аргументов для инициализации датчика
     * 
     * @returns {Object} Объект датчика
     */
    CreateDevice(id, opts) {
        opts = opts || {};
        if (typeof id !== 'string') {
            console.log(`ERROR>> id argument must to be a string`);
            return undefined;
        }
        let sensorConfig = Process.GetDeviceConfig(id);

        if (!sensorConfig) {
            console.log(`ERROR>> Failed to get ${id} config"`);
            return undefined;
        }

        let module = Process.ImportDeviceModule(sensorConfig.name, opts.moduleNum);
        if (!module) {
            console.log(`ERROR>> Cannot load ${sensorConfig.module}"`);
            return undefined;
        }

        if (!this.IsIDUnique(id)) {
            console.log(`ERROR>> Id ${id} is already used`);
            return undefined;
        }
        if (sensorConfig.bus) {
            if (sensorConfig.bus.startsWith('I2C')) {
                sensorConfig.bus = I2Cbus._I2Cbus[sensorConfig.bus].IDbus;
            } else if (sensorConfig.bus.startsWith('SPI')) {
                sensorConfig.bus = SPIbus._SPIbus[sensorConfig.bus].IDbus;
            } else if (sensorConfig.bus.startsWith('UART')) {
                sensorConfig.bus = SPIbus._UARTbus[sensorConfig.bus].IDbus;
            }
        }
        sensorConfig.pins = sensorConfig.pins || [];
        sensorConfig.pins = sensorConfig.pins.map(strPin => this.GetPinByStr(strPin));
        sensorConfig.id = id;

        if (!this.ArePinsAvailable(sensorConfig.pins)) {
            console.log(`ERROR>> Pins [${opts.pins.join(', ')}] are already used`);
            return undefined;
        }

        let device = new module(sensorConfig, sensorConfig);
        this.AddDevice(device);
        return device._Channels;
    }
    /**
     * @method
     * Возвращает объект пина по его имени
     * @param {String} strPin 
     * @returns 
     */
    GetPinByStr(strPin) {
        let p;
        try {
            p = eval(strPin);
        } catch (e) { }
        if (p instanceof Pin) return p;

        throw new Error(`ERROR>> Pin ${p} doesn't exist`);
    }
}

exports = ClassSensorManager;