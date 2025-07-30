declare module 'bpmn-js/lib/Modeler' {
  export default class BpmnModeler {
    constructor(options: any);
    importXML(xml: string): Promise<{warnings: any[]}>;
    importDefinitions(definitions: any): Promise<void>;
    saveXML(options?: {format?: boolean}): Promise<{xml: string}>;
    saveSVG(): Promise<{svg: string}>;
    destroy(): void;
    get(module: string): any;
    on(event: string, callback: Function): void;
    off(event: string, callback: Function): void;
  }
}