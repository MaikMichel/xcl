import { Project } from './Project';
import { spawnSync } from 'child_process';
import { ProjectFeature } from './ProjectFeature';
import chalk from 'chalk'
import * as fs from "fs-extra";
import * as os from "os";
import { Logger } from './Logger';
import { Environment } from './Environment';

const oracledb = require('oracledb')

const xclHome                  = os.homedir() + "/AppData/Roaming/xcl";
let instant_client_path:string = "";

if (os.platform() === 'darwin'){
  instant_client_path = xclHome + "/.instantClient";
}else{
  instant_client_path = xclHome + fs.readFileSync(xclHome + "/.instantClient").toString().trimEnd();
}

try{
  fs.existsSync(instant_client_path)?oracledb.initOracleClient({libDir: instant_client_path}):console.log('No Instant Client Installed in '+instant_client_path);
}catch(err){
  console.log(err);
}
export interface IConnectionProperties {
  user: string,
  password: string,
  connectString: string,
  privilege?: any
}


export class DBHelper {
  public static getConnectionProps(pUserName?: string, 
                                   pPassWord?: string,
                                   pConnUrl?: string):IConnectionProperties|undefined {
    let conn:IConnectionProperties = {
      user          : "" + (pUserName || process.env.NODE_ORACLEDB_USER ),
      password      : "" + (pPassWord || process.env.NODE_ORACLEDB_PASSWORD),
      connectString : "" + (pConnUrl  || process.env.NODE_ORACLEDB_CONNECTIONSTRING),
      // could not find constant, so looked up at
      // https://github.com/oracle/node-oracledb/blob/master/doc/api.md#oracledbconstantsprivilege
      privilege     : pUserName === 'sys' ? 2 : undefined
    };  
    
    // console.debug(conn);

    try {          
      if ([conn.user, conn.password, conn.connectString].includes('undefined')) {
        throw new Error("Not all connection params have a value!");
      } 

      return conn;

    } catch (err) {
      if (err instanceof Error) {
        console.error(chalk.red(err.message));
      }
    }
  }

  public static async isProjectInstalled(project: Project, conn:IConnectionProperties):Promise<boolean> {
    let connection;
    let countSchemas:number = 0;
    try {
      connection = await oracledb.getConnection(conn);
      let query = `SELECT count(1) FROM all_users where username like :username`;
  
      const result = await connection.execute(query, [`${project.getName().toUpperCase()}%`], { maxRows: 1, prefetchRows:1 } );
      countSchemas = result.rows[0][0];

    } catch (err) {
        console.error(chalk.red(err));
        process.exit(1);
    } finally {
      if (connection) {
        try {
          // Connections should always be released when not needed
          await connection.close();
        } catch (err) {
          console.error(chalk.red(err));
          process.exit(1);
        }
      }
      
      return Promise.resolve(countSchemas>0);
    }
  };

  //checks if a feature is installed
  public static async isFeatureInstalled(feature: ProjectFeature, project:Project, conn:IConnectionProperties):Promise<boolean>{
    let connection;
    let userCount=0;
    try{
      connection = await oracledb.getConnection(conn);
      const USER:string = project.getUsers().has(feature.getUser().getConnectionName()) ? project.getUsers().get(feature.getUser().getConnectionName())?.getName()! : feature.getUser().getConnectionName();
      //if the feature is supposed to be installed in a seperate schema named like the feature itself
      if(feature.getCreates().length > 0){
        const result = await connection.execute(`select count(1) FROM all_objects where owner like '${USER.toUpperCase()}' and object_name in ('${feature.getCreates().join("', '").toUpperCase()}')`);
        userCount = result.rows[0][0];
      }else{
        if (feature.getName() === feature.getUser().getName()){
          const result = await connection.execute(`SELECT count(1) FROM all_users where username like '${USER.toUpperCase()}'`);
          userCount = result.rows[0][0];
        }else{
          //check if the schema which is supposed to hold the installation of the feature contains an object called like the feature
          const result = await connection.execute(`SELECT count(1) FROM all_procedures where owner like '${USER.toUpperCase()}' and object_name like '%${feature.getName()}%'`);
          userCount = result.rows[0][0];
        }
      }
    }catch(err){
      console.error(err,"{color:red}");
    }finally{
      if(connection) {
        try{
          await connection.close();
        }catch(err){
          console.error(err);
        }
      }
      return Promise.resolve(userCount > 0)
    }
  }

  public static async getWorkspaceId(conn:IConnectionProperties, workspaceName:string):Promise<string>{
    let connection;
    try{
      connection = await oracledb.getConnection(conn);
      let query = `select workspace_id from apex_workspaces where workspace=upper('${workspaceName}')`;
      const result = await connection.execute(query);
      return result.rows[0][0];
    }catch(err){
      console.log(`ERROR: Could not find workspace id for workspace named '${workspaceName}' (${err})`);
      process.exit(1);
    }
  }


  public static async getOraVersion(conn:IConnectionProperties):Promise<number> {
    let connection;
    let version:number = 0;
    try {
      connection = await oracledb.getConnection(conn);
      let query = `select substr(version, 1, instr(version, '.', 1, 1)-1) 
      from product_component_version
     where product like 'Oracle Database %'`;
      
      const result = await connection.execute(query);
      
      version = result.rows[0][0];

    } catch (err) {
      console.error(err, "{color:red}");
    } finally {
      if (connection) {
        try {
          // Connections should always be released when not needed
          await connection.close();
        } catch (err) {
          console.error(err);
        }
      }
      
      return Promise.resolve(version);
    }
  };

  public static async getInvalidObjects(conn:IConnectionProperties):Promise<any>{
    let connection;
   
    let invalid_objects:{name:string, type:string}[]=[];

    try{
      connection = await oracledb.getConnection(conn);
      let query = `select  object_type, object_name
                    from user_objects
                    where status = 'INVALID'
                    order by object_type`;
    
    let errorQuery = `select 'Line '||line||' at position '||position||': '||text, name 
                    from user_errors`;
  
      const result   = await connection.execute(query);
      const errorSet = await connection.execute(errorQuery);
      if(result.rows != undefined){
        for (let i = 0; i<=result.rows.length-1; i++){
          let object:{name:string, type:string, errors:string[]}={
            name:  result.rows[i][1],
            type: result.rows[i][0],
            errors: []
          };        
          
          if (errorSet != undefined){
            for(let j = 0; j<=errorSet.rows.length - 1; j++){
              if(errorSet.rows[j][1] == object.name){
                object.errors.push(errorSet.rows[j][0]);
              }
            }
          }
          
          invalid_objects.push(object);
        }
      }
    }catch(err){
      console.error(err, "{color:red}");
    } finally {
      if (connection) {
        try {
          // Connections should always be released when not needed
          await connection.close();
        } catch (err) {
          console.error(err);
        }
      }
      return Promise.resolve(invalid_objects);
    }
  }


  public static getConnectionString(conn: IConnectionProperties):string {
    
    return  `${conn.user}/${conn.password}@${conn.connectString}${conn.user === 'sys' ? ' as sysdba' : ''}` 
  }

  public static executeScript(conn: IConnectionProperties, script: string,  logger:Logger){
    
    logger.getLogger().log("info", `Start script: ${script}`);

    let sqlCommand:string|undefined = Environment.readConfigFrom('all','client',false);
    if(!sqlCommand || (sqlCommand !== 'sql' && sqlCommand !== 'sqlplus')){
      sqlCommand = this.getSqlClient(logger);
      
    }
    if(sqlCommand){
    const childProcess = spawnSync(
      sqlCommand, // Sqlcl or sqlplus path should be in path
        ["-S", DBHelper.getConnectionString(conn)], {
          encoding: 'utf8',
          input: `@${script}`,
          shell: true
        }
      );

      if(childProcess.stderr!==''){
        DBHelper.logResults(`ERROR: Execution failed with the following error: ${childProcess.stderr}`, logger);
        process.exit(1);
      }else{
        DBHelper.logResults(childProcess, logger);
      }
    }else{
      DBHelper.logResults(`ERROR: Please define a SQL-Client like sqlcl or sqlplus`, logger);
      process.exit(1);
    }
    
  }

  public static executeScriptIn(conn: IConnectionProperties, script: string, cwd:string, logger:Logger){
    
    logger.getLogger().log("info", `Start script: ${script}`);

    let sqlCommand:string|undefined = Environment.readConfigFrom('all','client',false);
    if(!sqlCommand){
      sqlCommand = this.getSqlClient(logger);
    }

    if(sqlCommand){
      const childProcess = spawnSync(
        sqlCommand, // Sqlcl or sqlplus path should be in path
        ["-S", DBHelper.getConnectionString(conn)], {
          encoding: 'utf8',
          cwd: cwd,
          input: `@${script}`,
          shell: true
        }
      );
  
      if(childProcess.stderr!==''){
        DBHelper.logResults(`ERROR: Execution failed with the following error: ${childProcess.stderr}`, logger);
        process.exit(1);
      }else{
        DBHelper.logResults(childProcess, logger);
      }
    }else{
      DBHelper.logResults(`ERROR: Please define a SQL-Client`, logger);
      process.exit(1);
    }
  }

  private static logResults(childProcess:any, logger:Logger):void{
    if (!childProcess.error){
      logger.getLogger().log("info", childProcess.stdout); 
    }else{
      logger.getLogger().log("error", childProcess.stderr); 
    }
  }

  private static getSqlClient(logger:Logger):string|undefined{
    try{
      let result = spawnSync('sql');
      let client = "";
      if(result.stderr.toString()!==''){
        result = spawnSync('sqlplus');
        if(result.stderr.toString()!==''){
          return undefined;
        }else{
          client = 'sqlplus';
        }
      }else{
        client = 'sql';
      }

      return client;
    
    }catch(err){
      DBHelper.logResults(err, logger);
    }
  }

  
}