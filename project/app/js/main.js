/*
Copyright 2018 Google Inc.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/

// TODO - register service worker
if ('serviceWorker'in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js')
    .then(registration => {
      console.log('Service Worker registered: Scope: ${registration.scope}');
    })
    .catch(err => {
      console.log('Service Worker registration failed: ${err}');
    });
  });
}

const container = document.getElementById('container');
const offlineMessage = document.getElementById('offline');
const noDataMessage = document.getElementById('no-data');
const dataSavedMessage = document.getElementById('data-saved');
const saveErrorMessage = document.getElementById('save-error');
const addEventButton = document.getElementById('add-event-button');
const deleteEventButton = document.getElementById('delete-event-button');
const editEventButton = document.getElementById('edit-event-button');

addEventButton.addEventListener('click', addAndPostEvent);
deleteEventButton.addEventListener('click', deleteEvent);
editEventButton.addEventListener('click', editEvent);



Notification.requestPermission();

// TODO - create indexedDB database
function createIndexedDB() {
  if (!('indexedDB'in window)) {return null;}
  return idb.open('dashboardr', 1, function(upgradeDb){
    if (!upgradeDb.objectStoreNames.contains('events')) {
      const eventsOS = upgradeDb.createObjectStore('events', {keyPath: 'id'});
    }
  });
}

const dbPromise = createIndexedDB();

/* Get Info from IndexedDb */
function getLocalEventData() {
  if(!('indexedDB' in window)) {return null;}
  return dbPromise.then(db => {
    const tx = db.transaction ('events', 'readonly');
    const store = tx.objectStore('events');
    return store.getAll();
  });
}



function editEventLocally(eventId){
  if(!('indexedDB' in window)) {return null;}
  //return dbPromise.then(db => {
    const DBOpenRequest = window.indexedDB.open('dashboardr', 1);
    DBOpenRequest.onsuccess = function(event) {
      console.log('Db initialised.');
      db = DBOpenRequest.result;
      
      const tx = db.transaction ('events', 'readwrite');
      tx.oncomplete = function (event) {
        console.log('Tx completed.');
      };
      tx.onerror = function (event) {
        console.log('Tx not openeded because ' + tx.error);
      };
      
      const store = tx.objectStore('events');
      const objectStoreRequest = store.get(eventId);

      objectStoreRequest.onsuccess = function (event) {
        console.log('Request succesfull.');
        //myRecord = objectStoreRequest.result;
        //console.log(myRecord);
        let myRecord = objectStoreRequest.result;

        document.getElementById('date').value = myRecord.date;
        document.getElementById('title').value = myRecord.title;

        document.getElementById('event-form').scrollIntoView();

      };
      
    };

}

/* Remove data from IndexdDb */
function deleteEventLocally(eventId){ //change eventId to
  if (!('indexedDB' in window)) {return null;}
  return dbPromise.then(db => {
    const tx = db.transaction ('events', 'readwrite');
    const store = tx.objectStore('events');
    console.log(eventId + 'deleted');
    //store.delete(eventId); //need to work out how to promisify the delete TODO 
    const events = getLocalEventData(); 
    return Promise.all(events.map(eventId => store.delete(eventId)))
    .catch (() =>{
      tx.abort();
      throw Error('Event not deleted from store.')
    });
  });
}

function saveEventDataLocally(events) { //events is an object
  if (!('indexedDB' in window)) {return null;}
  return dbPromise.then(db => {
    const tx = db.transaction('events', 'readwrite');
    const store = tx.objectStore('events');
    return Promise.all(events.map(event => store.put(event)))
    .catch (() => {
      tx.abort();
      throw Error('Events were not added to the store');
    });
  });
}

function loadContentNetworkFirst() {
  getServerData()
  .then(dataFromNetwork => {
    updateUI(dataFromNetwork);
    saveEventDataLocally(dataFromNetwork)
    .then(() => {
      setLastUpdated(new Date());
      messageDataSaved();
    }).catch(err => {
      messageSaveError();
      console.warn(err);
    });
  }).catch(err => { // if we can't connect to the server...
    console.log('Network requests have failed, this is expected if offline');
    getLocalEventData()
    .then(offlineData => {
      if (offlineData.length == 0) {
        messageNoData();
      } else {
        messageOffline();
        updateUI(offlineData);
      }
    });
  });
}

loadContentNetworkFirst();



/* Network functions */
function getServerData() {
  return fetch('api/getAll').then(response => {
    if (!response.ok) {
      throw Error(response.statusText);
    }
    return response.json();
  });
}

function addAndPostEvent(e) {
  e.preventDefault();
  const data = {
    id: Date.now(),
    title: document.getElementById('title').value,
    date: document.getElementById('date').value,
    city: document.getElementById('city').value,
    note: document.getElementById('note').value

  };
  updateUI([data]);

  // TODO - save event data locally


  saveEventDataLocally([data]);

  const headers = new Headers({'Content-Type': 'application/json'});
  const body = JSON.stringify(data);
  return fetch('api/add', {
    method: 'POST',
    headers: headers,
    body: body
  });


}

function editEvent(eventId) {
  console.log(eventId);

  editEventLocally(eventId);
}

function deleteEvent(eventId){
  console.log(eventId);

  deleteEventLocally(eventId);

  const data = {
    id: eventId
  };

/*
  const headers = new Headers({'Content-Type': 'application/json'});
  const body = JSON.stringify(data);
  console.log(JSON.stringify(data));
  location.reload();
  return fetch('api/delete', {
    method: 'POST',
    headers: headers,
    body: body
  });*/
}

/* UI functions */

function updateUI(events) {
  events.forEach(event => {
    const item =
    `<tr>
      <th scope="ROW">1</th>     
      <td>${event.date}</td>
      <td>${event.title}</td>
      <td>${event.title}</td>
      <td>${event.title}</td>
      <td type="submit" id="edit-event-button" onclick="editEvent(${event.id})">Edit</td> 
      <td type="submit" onclick="deleteEvent(${event.id})">Delete</td>  
  </tr>`
    container.insertAdjacentHTML('beforeend', item);
  });
}

function messageOffline() {
  // alert user that data may not be current
  const lastUpdated = getLastUpdated();
  if (lastUpdated) {
    offlineMessage.textContent += ' Last fetched server data: ' + lastUpdated;
  }
  offlineMessage.style.display = 'block';
}

function messageNoData() {
  // alert user that there is no data available
  noDataMessage.style.display = 'block';
}

function messageDataSaved() {
  // alert user that data has been saved for offline
  const lastUpdated = getLastUpdated();
  if (lastUpdated) {dataSavedMessage.textContent += ' on ' + lastUpdated;}
  dataSavedMessage.style.display = 'block';
}

function messageSaveError() {
  // alert user that data couldn't be saved offline
  saveErrorMessage.style.display = 'block';
}

/* Storage functions */

function getLastUpdated() {
  return localStorage.getItem('lastUpdated');
}

function setLastUpdated(date) {
  localStorage.setItem('lastUpdated', date);
}

