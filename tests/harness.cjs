const express = require('express');
const jwt = require('jsonwebtoken');
const path = require('node:path');
const { register } = require('../modules/hispacold');
const testDependencies=process.env.HISPACOLD_TEST_DEPS||path.resolve(__dirname,'../../hispacold-test-tools/node_modules');
const { PGlite } = require(path.join(testDependencies,'@electric-sql/pglite'));
async function harness(){
 const db=new PGlite();
 await db.exec(`CREATE TABLE users(id TEXT PRIMARY KEY,nombre TEXT,role TEXT,activo BOOLEAN,deleted_at TIMESTAMPTZ);
 INSERT INTO users VALUES('admin','Administrador de prueba','admin',true,null),('operator','Operador','operador',true,null),('inactive','Inactivo','admin',false,null);
 CREATE TABLE fleet_units(id TEXT PRIMARY KEY,empresa TEXT,numero_economico TEXT,numero_obra TEXT,modelo TEXT,marca TEXT,anio TEXT,kilometraje TEXT);
 INSERT INTO fleet_units VALUES('fleet-1','Transportes de prueba','402','OB-402','Irizar i8','Irizar','2024','158000');
 CREATE TABLE legacy_sentinel(id TEXT PRIMARY KEY,data TEXT); INSERT INTO legacy_sentinel VALUES('unchanged','reportes-agenda-stock-cobranza');`);
 const query=async(sql,params)=>{if(!params&&sql.includes('CREATE TABLE'))return db.exec(sql);const r=await db.query(sql,params);return {...r,rowCount:r.affectedRows??r.rows.length};};
 const pool={query,connect:async()=>({query,release(){}})};
 const app=express();app.use(express.json({limit:'50mb'}));
 const authRequired=(req,res,next)=>{try{req.user=jwt.verify((req.headers.authorization||'').replace(/^Bearer /,''),'test-only');next();}catch{res.status(401).json({error:'No autorizado'});}};
 register(app,{pool,authRequired});app.use(express.static(path.join(__dirname,'../public')));
 const server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});
 const url='http://127.0.0.1:'+server.address().port;
 const token=(id='admin',role=id==='operator'?'operador':'admin')=>jwt.sign({id,role},'test-only');
 const request=async(route,{method='GET',body,user='admin',role,raw=false}={})=>{const r=await fetch(url+'/api/hispacold'+route,{method,headers:{'Content-Type':'application/json',...(user?{Authorization:'Bearer '+token(user,role)}:{})},...(body!==undefined?{body:JSON.stringify(body)}:{})});return {status:r.status,body:raw?Buffer.from(await r.arrayBuffer()):await r.json(),headers:r.headers};};
 return {db,pool,app,server,url,token,request,close:async()=>{await new Promise(resolve=>server.close(resolve));await db.close();}};
}
module.exports={harness};
