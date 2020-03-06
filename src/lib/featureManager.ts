//Imports
import * as yaml from "yaml";
import * as fs from "fs-extra";
import * as os from "os";
import * as https from "https";
import * as request from "request-promise-native";
import chalk from 'chalk'
import { Feature } from './Feature';
import { integer } from '@oclif/command/lib/flags';
import { ProjectManager } from './projectManager';
import { ProjectFeature } from './projectFeature';
import { Request } from 'request';
import requestPromise = require('request-promise-native');
import { GithubCredentials } from './GithubCredentials';
import * as AdmZip from "adm-zip";
import { Executer } from './Executer';
const Table = require('cli-table');

export class FeatureManager{
    public static softwareYMLfile: string = "software.yml";

    private static manager: FeatureManager;
    private static xclHome = os.homedir + "/AppData/Roaming/xcl";
    private static softwareYaml: yaml.ast.Document;
    private static softwareJson: any;
    private static features: Map<String, Feature>;
 

    private constructor(){
        FeatureManager.softwareYaml = yaml.parseDocument(fs.readFileSync(FeatureManager.xclHome + "/" 
                                                            + FeatureManager.softwareYMLfile).toString());

        // convert to json of create an empty definition
        FeatureManager.softwareJson = FeatureManager.softwareYaml.toJSON();
        FeatureManager.features = new Map();

        Object.keys(FeatureManager.softwareJson.software).forEach(function(softwareName){
          let softwareJSON = FeatureManager.softwareJson.software[softwareName];
          FeatureManager.features.set(softwareName, new Feature({ name: softwareName, 
                                                                  owner: softwareJSON.owner, 
                                                                  repo: softwareJSON.repo, 
                                                                  gitAttribute: softwareJSON.call
                                                                })
                                                              );
        });
        // what else belongs to FM?
    }

    static getInstance() {
        if (!FeatureManager.manager) {
          console.log('Create!');
          FeatureManager.manager = new FeatureManager();
        }
        return FeatureManager.manager;
      }

    public listFeatures() {
        const table = new Table({
          head: [        
            chalk.blueBright('name'),
            chalk.blueBright('github-repository'),
            chalk.blueBright('owner')
          ]
        });
        let feature:Feature;

        for(feature of FeatureManager.features.values()){
          table.push([ feature.getName(), feature.getRepo(), feature.getOwner() ]);
        }
    
        console.log(table.toString());
      }

      public getFeatureReleases(name:string){
        const table = new Table({
          head: [        
            chalk.blueBright(name)
          ]
        });
        
        if(FeatureManager.features.has(name.toLowerCase())){
            (FeatureManager.features.get(name.toLowerCase()) ! ).getReleaseInformation().then(function(releases:String[]){
            for (let i=0; i<releases.length; i++){
              table.push([releases[i]]);
            }
            //FeatureManager.getInstance().addFeatureToProject('logger','3.1.0','lalala');
            console.log(table.toString());
          });
          
        }else{
          throw Error('Unknown Feature: '+name+' Try: xcl feature:list');
        }
      }

      public addFeatureToProject(featureName:string, version:string, projectName:string, username: string, password: string){
        let pManager:ProjectManager=ProjectManager.getInstance();
        pManager.getProject(projectName).addFeature( (this.getProjectFeature(featureName, version, username, password) ! ));
        this.downloadFeature(pManager.getProject(projectName).getFeatures().get(featureName)!, projectName);
      }

      private downloadFeature(feature:ProjectFeature, projectName:string){
        let pManager:ProjectManager=ProjectManager.getInstance();
        return new Promise((resolve, reject)=>{
          var filename = pManager.getProject(projectName).getPath() +'/dependencies/'+feature.getRepo()+'_'+feature.getReleaseInformation()+'.zip';
          feature.getDownloadUrl()
                    .then(function(url){
                    var options = {
                      uri: "",
                      headers: {}
                    };
                    
                    options.uri=url;

                    if (GithubCredentials.get()){
                        options.headers= {
                            'User-Agent': 'xcl',
                            'Authorization': 'Basic '+GithubCredentials.get()
                        };
                    }else{
                      options.headers= {
                        'User-Agent': 'xcl'
                      }
                    }

              if(!fs.pathExistsSync(pManager.getProject(projectName).getPath() +'/dependencies')){
                  fs.mkdirSync(pManager.getProject(projectName).getPath() +'/dependencies');
              }

              request(options)
                    .pipe(
                      fs.createWriteStream(filename)
                          .on('close', function(){
                            resolve();
                          })
                      );
                });
          });
      }

      public listProjectFeatures(projectName:string){
        const table = new Table({
          head: [        
            chalk.blueBright('name'),
            chalk.blueBright('version'),
            chalk.blueBright('status')
          ]
        });

        let feature:ProjectFeature;

        for(feature of ProjectManager.getInstance().getProject(projectName).getFeatures().values()){
          table.push([
                      feature.getName(), 
                      feature.getReleaseInformation(),
                      feature.getStatus()
                    ]);
        }
      

        console.log(table.toString());
      }

      public getProjectFeature(featureName:string, version:string, username:string, password:string, installed:Boolean=false):ProjectFeature|undefined{
        let feature:ProjectFeature|undefined;
        if( FeatureManager.features.has(featureName.toLowerCase()) ){
          if (FeatureManager.features.get(featureName.toLowerCase()) !== undefined ){
            feature = new ProjectFeature({parent: (FeatureManager.features.get(featureName.toLowerCase()) !),
                                              version: version,
                                              username: username,
                                              password: password,
                                              installed: installed
                                          });
            if (feature === undefined){                                            
              throw Error("Feature could not be found!");
            }
          }
        }else{
          throw Error ("Unkown feature!");
        }
        return feature;
      }

      public installProjectFeature(featureName:string, connection:string, projectName:string){
          if (ProjectManager.getInstance().getProject(projectName).getFeatures().has(featureName)){
            let feature:ProjectFeature=ProjectManager.getInstance().getProject(projectName).getFeatures().get(featureName)!;
            if (FeatureManager.getInstallSteps(feature.getName()).installzip){
              var zip = new AdmZip(ProjectManager.getInstance().getProject(projectName).getPath()+'/dependencies/'+feature.getName()+'_'+feature.getReleaseInformation()+'.zip');
              zip.extractAllTo(ProjectManager.getInstance().getProject(projectName).getPath()+'/dependencies/');
              var zipEntries = zip.getEntries();
              var unzipped=zipEntries[0].entryName.toString();
              fs.renameSync(ProjectManager.getInstance().getProject(projectName).getPath()+'/dependencies/'+unzipped,
                        ProjectManager.getInstance().getProject(projectName).getPath()+'/dependencies/'+feature.getName().toLowerCase()+'_'+feature.getReleaseInformation()+'_tmp');
              var pathTmp=ProjectManager.getInstance().getProject(projectName).getPath()+'/dependencies/'+feature.getName().toLowerCase()+'_'+feature.getReleaseInformation()+'_tmp';
              zip = new AdmZip(pathTmp+'/'+FeatureManager.getInstallSteps(feature.getName()).installzip[0].path+'/'+feature.getName().toLowerCase()+'_'+feature.getReleaseInformation()+'.zip');
              zip.extractAllTo(ProjectManager.getInstance().getProject(projectName).getPath()+'/dependencies/'+feature.getName().toLowerCase()+'_'+feature.getReleaseInformation()+'/');
              fs.removeSync(pathTmp);
            }else{
              var zip = new AdmZip(ProjectManager.getInstance().getProject(projectName).getPath()+'/dependencies/'+feature.getName()+'_'+feature.getReleaseInformation()+'.zip');
              zip.extractAllTo(ProjectManager.getInstance().getProject(projectName).getPath()+'/dependencies/');
            }



          }else{
            console.log(chalk.red('ERROR: Dependency missing! Execute ´xcl feature:add´ first!'));
          } 
      }

      private static getInstallSteps(featureName:string):any{
        if(FeatureManager.softwareJson.software[featureName]){
          return FeatureManager.softwareJson.software[featureName].install;
        }else{
          throw Error('Could not find installation information! Update your software.yml File!');
        }
      }
}