// define weekDays
const weekDays = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const scheduleCache = {};
// define data points
const dp_heating_period = '0_userdata.0.Heating.heating_period';
const dp_off_temp = '0_userdata.0.Heating.off_temp';
const dp_present = '0_userdata.0.Heating.present';
// Array for timeouts
const timeouts =[];

// create heating period data point
createState(dp_present, true, {name: 'Is a resident present', type: 'boolean', role: 'state'});
// create heating period data point
createState(dp_heating_period, false, {name: 'Is the heating period active', type: 'boolean', role: 'state'});
// create heating off temperature data point
createState(dp_off_temp, 5, {name: 'Turn off temperature', type: 'number', role: 'value', 'unit': '°C'});
// read heatingPeriod data point
let heatingPeriod = getState(dp_heating_period).val;
let off_temp = getState(dp_off_temp).val;
let present = getState(dp_present).val;

// get all rooms
const rooms = getEnums('rooms');
// create heatingRooms
const heatingRooms = createHeatingRooms();
// create heating profile data points
createHeatingProfileDataPoins();

// start heating logic init
subscribeHeatingBreaker();       
subscribeRadiators(); 

on({id: dp_present, change: 'ne'}, (obj)=>{
    present = obj.state.val;
    setState(obj.id, obj.state.val, true);
    setHeatingAllRooms();
});

on({id: dp_heating_period, change: 'ne'}, (obj)=>{
    heatingPeriod = obj.state.val;
    setState(obj.id, obj.state.val, true);
    setHeatingAllRooms();
});

on({id: dp_off_temp, change: 'ne'}, (obj)=>{
    off_temp = obj.state.val;
    setState(obj.id, obj.state.val, true);
    setHeatingAllRooms();
});

checkHeatingBrakerAllRooms();
scheduleHeatingProfileAllRooms();
setHeatingAllRooms();


// This function searches for radiators in all rooms.
// If a radiator is found in the room, a HeatingRoom is created for it and then heatingBreakers are also searched for in this room.
function createHeatingRooms(){
    const heatingRooms = {};   
    
    // All rooms pass through  
    for (const key in rooms){
        const heatingRoomName = rooms[key].id.replace('enum.rooms.', '');

        // Search in room for radiator (functions=heating)
        $(`[state.id=*current*](functions=heating)(rooms=${heatingRoomName})`).each((id)=>{
            if (!heatingRooms[heatingRoomName]){
                heatingRooms[heatingRoomName] = {name: heatingRoomName, heatingBreakerActive: false, heatingBreaker: {}, radiators: {}, profiles: {}, heating_temperature: 0, night_reduction: 0,  heating_breaker_delay: 0};
            }        
            heatingRooms[heatingRoomName].radiators[id] = getState(id).val;       
        });       
    };

    // Create data points for rooms with radiators 
    createHeatingProfileDataPoins(heatingRooms);
    
    // All heating rooms pass through 
    for (const heatingRoomName in heatingRooms){
        // Search in the room for windows or door contacts that have the heating_breaker function assigned.
        $(`[state.id=*.opened](functions=heating_breaker)(rooms=${heatingRoomName})`).each((id)=>{
            heatingRooms[heatingRoomName].heatingBreaker[id] = getState(id).val; 
        });
        // Read the heating profiles for the room
        const roomFriendlyName = getRoomFriendlyName(heatingRoomName);
        $(`[state.id=0_userdata.0.Heating.${roomFriendlyName}.*day]`).each((id)=>{
            const weekNumber = weekDays.indexOf(id.split('.')[4])
            heatingRooms[heatingRoomName].profiles[weekNumber] = getState(id).val;
        });  
        // Reading the heating temperature and the night reduction temperature 
        heatingRooms[heatingRoomName].heating_temperature = getState(`0_userdata.0.Heating.${roomFriendlyName}.heating_temperature`).val;           
        heatingRooms[heatingRoomName].night_reduction = getState(`0_userdata.0.Heating.${roomFriendlyName}.night_reduction`).val;
        heatingRooms[heatingRoomName].heating_breaker_delay = getState(`0_userdata.0.Heating.${roomFriendlyName}.heating_breaker_delay`).val;
    }
    //log(`Created heating rooms: ${JSON.stringify(heatingRooms)}`);
    return heatingRooms;
}

function createHeatingProfileDataPoins(heatingRooms){
    setObject('0_userdata.0.Heating', { common: { name: 'Heating' }, type: 'folder' });
    for(const roomKey in heatingRooms){      
        const roomName = getRoomFriendlyName(roomKey);
        const dp_heating_temperature = `0_userdata.0.Heating.${roomName}.heating_temperature`;
        const dp_night_reduction = `0_userdata.0.Heating.${roomName}.night_reduction`;
        const dp_heating_breaker_delay = `0_userdata.0.Heating.${roomName}.heating_breaker_delay`;

        on({id: dp_heating_temperature, change: 'ne'}, (obj)=>{    
            heatingRooms[roomKey].heating_temperature = obj.state.val; 
            setState(obj.id, obj.state.val, true);        
            setHeating(heatingRooms[roomKey]);
        });

        on({id: dp_night_reduction  , change: 'ne'}, (obj)=>{   
            heatingRooms[roomKey].night_reduction = obj.state.val;
            setState(obj.id, obj.state.val, true);
            setHeating(heatingRooms[roomKey]);
        });

        on({id: dp_heating_breaker_delay, change: 'ne'}, (obj)=>{    
            heatingRooms[roomKey].heating_breaker_delay = obj.state.val; 
            setState(obj.id, obj.state.val, true);
        });

        setObject(`0_userdata.0.Heating.${roomName}`,{ common: { name: roomName }, type: 'folder' });
        createState(dp_heating_temperature,21,{ name: 'Heating temperature for this room',type: 'number',role: 'value','unit': '°C' });
        createState(dp_night_reduction, 16, {name: 'Night reduction for this room', type: 'number', role: 'value', 'unit': '°C'});
        createState(dp_heating_breaker_delay, 10, {name: 'Delay of heating breaker', type: 'number', role: 'value', 'unit': 'Sec.'});

        for(const weekKey in weekDays){
            const id = `0_userdata.0.Heating.${roomName}.${weekDays[weekKey]}`;
            createState(id, '08:00-19:00', {name: `${firstToUpper(weekDays[weekKey])} heating profile for this room`, type: 'string', role: 'state'});     
            
            on({id: id, change: 'ne'}, (obj)=>{    
                heatingRooms[roomKey].profiles[weekKey] = obj.state.val; 
                setState(obj.id, obj.state.val, true);
                scheduleHeatingProfile(heatingRooms[roomKey])          
                setHeating(heatingRooms[roomKey]);
            });
        }
    }
}

function subscribeHeatingBreaker(){
    for (const key in heatingRooms){
        for (const breaker in heatingRooms[key].heatingBreaker){
            on({id: breaker, change: 'ne'}, (obj)=>{               
                if (timeouts[breaker]){
                    clearTimeout(timeouts[breaker]);
                }
                timeouts[breaker] = setTimeout(()=>{
                    heatingRooms[key].heatingBreaker[breaker] = obj.state.val;                
                    checkHeatingBraker(heatingRooms[key]);
                    setHeating(heatingRooms[key]);
                },  heatingRooms[key].heating_breaker_delay * 1000);
            });
        }
    }
}

function subscribeRadiators(){
    for (const key in heatingRooms){
        for (const radiator in heatingRooms[key].radiators){
            on({id: radiator, change: 'ne'}, (obj)=>{
                heatingRooms[key].radiators[radiator] = obj.state.val;
            });
        }
    }
}

function scheduleHeatingProfileAllRooms(){
    for (const key in heatingRooms){
        scheduleHeatingProfile(heatingRooms[key]);
    }
}

function scheduleHeatingProfile(room){
    for (const key in room.profiles){
        const profile = room.profiles[key];        
        const startKey = `${room.name}_${key}_start`;
        const endKey = `${room.name}_${key}_end`;
        if (profile){
            const profileObj = createProfileObject(profile);

            if (scheduleCache[startKey]){
                clearSchedule(scheduleCache[startKey]);
            }
            if (scheduleCache[endKey]){
                clearSchedule(scheduleCache[endKey]);
            }
            scheduleCache[startKey] = schedule({dayOfWeek: key, hour: profileObj.start.hour, minute: profileObj.start.minute}, ()=>{setHeating(room)});
            scheduleCache[endKey] = schedule({dayOfWeek: key, hour: profileObj.end.hour, minute: profileObj.end.minute}, ()=>{setHeating(room)});
        }
    }
}

function checkHeatingBrakerAllRooms(){
    for (const key in heatingRooms){       
        checkHeatingBraker(heatingRooms[key]);       
    }
}

function checkHeatingBraker(room){
    room.heatingBreakerActive = false;    
    for (const key in room.heatingBreaker){
        if (room.heatingBreaker[key] == true){
            room.heatingBreakerActive = true;
            break;
        }
    }  
}

function setHeatingAllRooms(){
    for (const key in heatingRooms){       
        setHeating(heatingRooms[key]);       
    }
}

function setHeating(room){
    if (!heatingPeriod){  
        for (const key in room.radiators){
            if (room.radiators[key] != off_temp){
                setState(key, off_temp);
                log(`No heating period -> ${key} set to ${off_temp}`);
            }
        }
        log(`No heating period -> ${room.name} heating deactivate`);
    } 
    else if (room.heatingBreakerActive){  
        for (const key in room.radiators){
            if (room.radiators[key] != off_temp){
                setState(key, off_temp);
                log(`Heating breaker active -> ${key} set to ${off_temp}`);
            }
        }
        log(`Heating breaker active -> ${room.name} heating deactivate`); 
    } 
    // Is a resident present?
    else if (!present){
       for (const key in room.radiators){
            if (room.radiators[key] != room.night_reduction){
                setState(key, room.night_reduction);
                log(`No present is a resident -> ${key} set to ${room.night_reduction}`);
            }
        }
        log(`No present is a resident -> ${room.name} heating night reduction`);
    } 
    else {
        const currentDayOfWeek = getCurrentDayOfWeek();
        const profileObj = createProfileObject(room.profiles[currentDayOfWeek]);
        const heating = compareTime(profileObj.startString, profileObj.endString, 'between');

        if (heating){
            for (const key in room.radiators){      
                if (room.radiators[key] != room.heating_temperature){          
                    setState(key, room.heating_temperature);
                    log(`${key} set to ${room.heating_temperature}`);
                }
            }
            log(`${room.name} heating activate`);
        }
        else {
            for (const key in room.radiators){
                if (room.radiators[key] != room.night_reduction){ 
                    setState(key, room.night_reduction);
                    log(`${key} set to ${room.night_reduction}`);
                }
            }
            log(`${room.name} heating night reduction`);
        }
    }
}

function firstToUpper(string) {
  return string.charAt(0).toUpperCase() + string.slice(1);
}

function getRoomFriendlyName(heatingRoomName){
    const room = rooms.find(x => x.id.endsWith(heatingRoomName));
    if (typeof room.name === 'object'){
        return room.name.de;
    } else {
        return room.name;
    }
}

function createProfileObject(profile){
    const startString = profile.split('-')[0];
    const start = {hour: profile.split('-')[0].split(':')[0], minute: profile.split('-')[0].split(':')[1]};
    const endString = profile.split('-')[1];
    const end = {hour: profile.split('-')[1].split(':')[0], minute: profile.split('-')[1].split(':')[1]};
    return {start, end, startString, endString};
}

function getCurrentDayOfWeek(){
    return new Date().getDay();
}
