import { db } from '../firebase'
import {
    collection, 
    doc, 
    getDoc,
    getDocs,
    query,
    where,
    deleteDoc
} from 'firebase/firestore'

//import { useCollectionData } from 'react-firebase-hooks/firestore'

/** A dictionary that stores certain details from the user session to minimize database reads. */
var cache = {
    shopTag: null,
    ticketData: [],
    prizeData: null,
    uid: null
}

/** Clears the cache dictionary (shopTag, ticketData, and uid) */
export function clearCachedData() {
    cache = {};
}

/**
 * Saves ticket data to memory so that it can be accessed without reading from the database.
 * @param {*} data ticket data to cache
 * @returns an array of currently cached ticket data
 */
export function saveTicketsToMemory(data) {
    if (cache.ticketData) {
        for (let i = 0; i < data.length; i++) {
            data[i].id = cache.ticketData.length+1;
            cache.ticketData = Array.prototype.concat(cache.ticketData,data[i]);
        }
    } else {
        cache.ticketData = [data];
    }
    return cache.ticketData;
}

/**
 * Saves prize data to memory so that it can be accessed without reading from the database.
 * @param {*} data prize data to cache
 * @returns an array of currently cached prize data
 */
export function savePrizesToMemory(data) {
    if (cache.prizeData) {
        for (let i = 0; i < data.length; i++) {
            data[i].id = cache.prizeData.length+1;
            cache.prizeData = Array.prototype.concat(cache.prizeData,data[i]);
        }
    } else {
        cache.prizeData = [data];
    }
    return cache.prizeData;
}

/**
 * Retrieves JSON object info of a single ticket from the database
 * @param {string} code a ticket's play code (must exist on the database first)
 * @returns {Promise<any>} JSON data for the ticket
 */
export const getTicketByCode = async (code) => {
    return { name: "NotImplementedError", message: "function not implemented yet!" };
}

/**
 * Retrieves prize info for a corresponding ticket code
 * @param {string} code a ticket's play code (must exist on the database first)
 * @returns {Promise<any>} prize info in JSON/dictionary format
 */
export const getPrizeByCode = async (code) => {
    return { name: "NotImplementedError", message: "function not implemented yet!" };
}

/**
 * Queries the database for all tickets containing a specific prefix.
 * @param {*} prefix the prefix to query for
 * @returns an array list of tickets with the matching prefix, array is empty if no results were found
 */
export const getTicketsByPrefix = async (prefix) => {
    var len = prefix.length;
    var head = prefix.slice(0, len-1);
    var tail = prefix.slice(len-1, len);

    var start = prefix;
    var stop = head + String.fromCharCode(tail.charCodeAt(0) + 1);

    const ticketsRef = collection(db, "ticket-info");
    const q = query(ticketsRef,
            where("__name__", '>=', start),
            where("__name__", '<', stop));
    
    // Retrieve data snapshot, first from cache, then from server
    var data = [];
    if (cache.ticketData && cache.ticketData.length > 0) {
        data = cache.ticketData;
    } else {
        const snap = await getDocs(q);

        snap.forEach( (doc) => {
            var d = doc.data();
            d.id = data.length+1;
            d.code = doc.id;
            data.push(d);
        });

        cache.ticketData = data;
    }
    return data;
}

/**
 * Grabs a user's current shop tag from the database.
 * @param {*} uid user id
 * @returns {string} the shop tag that belongs to the given user id
 */
export const getUserShopTag = async (uid) => {
    var tag;
    if (cache.shopTag) {
        tag = cache.shopTag
    } else {
        var ref = doc(db, "users", uid);
        var snapshot = await getDoc(ref);

        if (snapshot.exists()) {
            tag = snapshot.data().shopTag;
            cache.shopTag = tag;
        } else {
            alert("No shop tag set!");
            tag = null;
        }
    }    

    return tag;
}

/**
 * Takes an auth context user object and returns a list of tickets generated by that user.
 * @param {*} user the auth context user (provided by the auth module when the user signs in) 
 * @returns an array list of tickets generated by that user
 */
export const getTicketsGeneratedByUser = async (user) => {
    var prefix = await getUserShopTag(user.uid);
    return getTicketsByPrefix(prefix);
}


/**
 * @param {*} user 
 * @returns a list of prizes (info and metadata together) created by the given user
 */
export const getPrizesGeneratedByUser = async (user) => {
    const prizesRef = collection(db, "prizes");
    const q = query(prizesRef,
        where("creatorUserID", '==', user.uid));
    
    const snap = await getDocs(q); // returns a promise
    const prizes = [];
    
    if (cache.prizeData)
        return cache.prizeData;

    for (let i = 0; i < snap.size; i++) {
        const doc = snap.docs[i];
        const prizeMetaData = doc.data();
        const prizeInfoData = await getPrizeInfo(doc.id);
        
        // Combine the data together
        const fullPrizeData = {
            id: i+1,
            docId: doc.id,
            name: prizeInfoData.name,
            description: prizeInfoData.description,
            image: prizeInfoData.image,
            quantity: prizeMetaData.quantity,
            createdAt: prizeMetaData.createdAt
        }

        prizes.push(fullPrizeData);
    }
    cache.prizeData = prizes;
    return prizes;
}


/**
 * Returns info data for a prize from the 'prize-info' collection.
 * @param {*} id 
 * @returns a dictionary containing prize info data
 */
export const getPrizeInfo = async (id) => {
    let result;
    const prizesRef = doc(db,"prize-info", id);
    const snap = await getDoc(prizesRef); // waits for the returned promise to resolve

    if(snap.exists()){
        result = snap.data();
    }

    return result;
}

/**
 * Returns info data for a prize from the 'prize' collection.
 * @param {*} id 
 * @returns a dictionary containing prize data
 */
export const getPrizeMetaData = async (id) => {
    let result;
    const prizesRef = doc(db, "prizes", id);
    const snap = await getDoc(prizesRef); // waits for the returned promise to resolve

    if (snap.exists()) {
        result = snap.data();
    }

    return result;
}

/**
 * Deletes a prize from firestore and memory (cache).
 * @param {*} id document id for the prize
 * @returns true if a document was successfully deleted, otherwise false if nothing was deleted
 */
export const deletePrize = async (id) => {
    let itemDeleted = false;

    // Delete document from Firestore
    await deleteDoc(doc(db, "prizes", id));
    await deleteDoc(doc(db, "prize-info", id));

    // Delete from cache
    if (cache.prizeData) {  
        cache.prizeData = null;
    }

    itemDeleted = true;
    return itemDeleted;
}