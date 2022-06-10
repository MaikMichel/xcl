import { ProjectFeature } from './ProjectFeature';

export interface DeliveryMethod{
    install(feature:ProjectFeature, projectPath:string, singleSchema:boolean)   : void;
    build(projectName:string, version:string, mode:string, commit:string|undefined)     : void;
    deploy(projectName:string, connection:string, password:string, schemaOnly:boolean, ords:string, silentMode:boolean, version:string, mode:string, schema:string|undefined, nocompile:boolean|undefined) : Promise<{success: boolean, mode: string}>;
    remove(feature:ProjectFeature, projectPath:string, singleSchema:boolean)    : void;
}