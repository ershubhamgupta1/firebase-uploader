const excelToJson = require('convert-excel-to-json');
var admin = require("firebase-admin");
var serviceAccount = require("./serviceAccountKey.json");

const CATEGORY_COLLECTION_NAME = 'categories';
const ITEM_COLLECTION_NAME = 'items';
const COMPONENT_COLLECTION_NAME = 'components';
const ITEM_COMPONENTS_COLLECTION_NAME = 'item-components';

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

// admin.initializeApp({
//   credential: admin.credential.cert(serviceAccount),
//   databaseURL: "YOUR_PROJECT_LINK"
// });

const firestore = admin.firestore();
const path = require("path");
const fs = require("fs");
const directoryPath = path.join(__dirname, "collections.xlsx");

const collectionsData = excelToJson({
    sourceFile: directoryPath,
    sheets:[{
        name: CATEGORY_COLLECTION_NAME,
        header:{
            rows: 1
        },
        columnToKey: {
        	A: 'id',
    		B: 'name',
    		C: 'photo_url',
    		D: 'itemCount',
    		E: 'displayOrder',
        }
    },
    {
        name: ITEM_COLLECTION_NAME,
        header:{
            rows: 1
        },
        columnToKey: {
        	A: 'id',
    		B: 'title',
    		C: 'photo_url',
    		D: 'description',
    		E: 'photosArray',
    		F: 'quantity',
    		G: 'quantityType',
    		H: 'time',
    		I: 'categoryId',
            J: 'costPerUnit'
        }
    },
    {
        name: COMPONENT_COLLECTION_NAME,
        header:{
            rows: 1
        },
        columnToKey: {
        	A: 'id',
    		B: 'name',
    		C: 'photo_url',
        }
    },
    {
        name: ITEM_COMPONENTS_COLLECTION_NAME,
        header:{
            rows: 1
        },
        columnToKey: {
        	A: 'componentId',
    		B: 'itemId',
    		C: 'quantity',
        }
    },
]
});

const insertDataInCollection = async({collection, data})=>{
    try{
        for(let i=0; i < data.length; i++){
            const obj = data[i];
            await firestore.collection(collection).doc(obj.id+'').set(obj)
            console.log("Document written");
        }    
    }
    catch(err){
        console.error("Error adding document: ", err);
    }
}

const updateDateInItemCollection = async({data})=>{
    try{
        const itemsObj = {};
        for(let i=0; i < data.length; i++){
            const {componentId, itemId, quantity} = data[i];
            if(!itemsObj[itemId]) itemsObj[itemId] = {componentIds: [componentId], components: [{id: firestore.doc(`${ITEM_COLLECTION_NAME}/` + componentId), quantity}]};
            else {
                itemsObj[itemId].components.push({id: firestore.doc(`${ITEM_COLLECTION_NAME}/` + componentId), quantity});
                itemsObj[itemId].componentIds.push(componentId);
            }
        }
        for(let itemId in itemsObj){
            const {componentIds, components} = itemsObj[itemId];
            await firestore.collection(ITEM_COLLECTION_NAME).doc(itemId).update({components, componentIds })
            // console.log("Document updated in item collection");
        }
    }
    catch(err){
        console.error("Error while updating in item collection: ", err);
    }
}

const permutations = (arr,len, val, existing, res) => {
    if(len==0){
       res.push(val);
       return;
    }
    for(let i=0; i<arr.length; i++){
       // so that we do not repeat the item, using an array here makes it  O(1) operation
       if(!existing[i]){
          existing[i] = true;
          permutations(arr, len-1, val+ ' ' + arr[i], existing, res);
          existing[i] = false;
       }
    }
 }
 const buildPermuations = (arr = []) => {
    let res = [];
    for(let i=0; i < arr.length; i++){
       permutations(arr, arr.length-i, "", [], res);
    }
    return res;
 };

async function main(){
    for(let collectionKey in collectionsData){
        let data = collectionsData[collectionKey];
        const records = [];
        if(collectionKey === ITEM_COLLECTION_NAME){
            for(let i=0; i < data.length; i++){
                const item = data[i];
                const catName = (await firestore.collection(`${CATEGORY_COLLECTION_NAME}`).doc(item.categoryId+'').get()).data().name;
                let titleKeyword = item.title.split(' ');
                const combinationOfkeywords = buildPermuations(titleKeyword);
                titleKeyword = titleKeyword.concat(combinationOfkeywords);
                item.keywords = titleKeyword.map(keyword=> keyword.toLowerCase().trim());
                item.keywords.push(catName.toLowerCase());

                item.categoryId = firestore.doc(`${CATEGORY_COLLECTION_NAME}/` + item.categoryId);
                if(item.photosArray) item.photosArray = JSON.parse(item.photosArray);
                records.push(item);
            }
        }
        if(collectionKey === ITEM_COMPONENTS_COLLECTION_NAME){
            await updateDateInItemCollection({data: records});
        }
        else{
            await insertDataInCollection({collection: collectionKey, data: records});
        }
    }
}

main();