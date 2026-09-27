import test from 'node:test';
import assert from 'node:assert/strict';
import {applySavedLock,zoomWithinLock,pointWithinLock} from '../lib/map-lock.ts';
const saved={locked:true,zoom:14,bounds:{north:20,south:19,east:74,west:73},center:{lat:19.5,lng:73.5}};
const createMap=()=>({zoom:10,options:{},setOptions(v){Object.assign(this.options,v)},setZoom(v){this.zoom=v},getZoom(){return this.zoom}});
test('saving applies minimum zoom and strict bounds, without a maximum zoom',()=>{
 const m=createMap();applySavedLock(m,saved);
 assert.equal(m.options.minZoom,14);assert.equal(m.zoom,14);assert.equal(m.options.restriction.strictBounds,true);
 assert.deepEqual(m.options.restriction.latLngBounds,saved.bounds);assert.equal(m.options.maxZoom,undefined);
});
test('zoom-in remains possible, zoom-out stops at the saved floor',()=>{
 const m=createMap();applySavedLock(m,saved);zoomWithinLock(m,5,saved);assert.equal(m.zoom,19);
 zoomWithinLock(m,-100,saved);assert.equal(m.zoom,14);
});
test('applying lock again preserves a closer zoom',()=>{
 const m=createMap();m.zoom=18;applySavedLock(m,saved);assert.equal(m.zoom,18);
});
test('only explicit unlock clears the restriction',()=>{
 const m=createMap();applySavedLock(m,saved);applySavedLock(m,{...saved,locked:false});
 assert.equal(m.options.minZoom,0);assert.equal(m.options.restriction,null);
});
test('coordinates outside the saved frame are rejected',()=>{
 assert.equal(pointWithinLock(saved.center,saved),true);
 assert.equal(pointWithinLock({lat:18,lng:73.5},saved),false);
 assert.equal(pointWithinLock({lat:18,lng:73.5},{...saved,locked:false}),true);
});
