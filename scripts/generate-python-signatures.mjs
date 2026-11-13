import ts from 'typescript';
import fs from 'node:fs';
import path from 'node:path';
import { apiMetadata } from './python-api-metadata.mjs';
import { componentOptions, componentTakes, inLanguage, optionsTable, takes } from '../src/lib/scene/options.js';
import { fileURLToPath, pathToFileURL } from 'node:url';
import coreTable from '../src/lib/scene/options.json' with { type: 'json' };
import { chartEntries, chartOutputs, chartTypes, loadCharts, templateEntries, templateTypes } from './charts.mjs';
import { pluginComponentEntries, pluginComponentTypes, pluginComponentOutputs, pluginParameterSchemas } from './plugin-components.mjs';
import { TEMPLATES } from '../src/lib/templates/builtins.js';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// The charts (TODO 130.4) and the built-in templates' signatures (130.5): their table entries
// replace what options.charts.json and options.templates.json held when options.js loaded, so
// every step below sees the definitions as they are now.
const charts=await loadCharts(root);
for(const kind of Object.keys(optionsTable.components))if(!coreTable.components[kind])delete optionsTable.components[kind];
const pluginTable=pluginComponentEntries(coreTable);
const templateTable=templateEntries(TEMPLATES,coreTable);
Object.assign(optionsTable.components,pluginTable,templateTable,chartEntries(charts,{components:{...coreTable.components,...templateTable}}));
const file=path.join(root,'src/lib/plot/publicTypes.ts');
// The generated props types are read as generated now, not as on disk (a stale or missing file).
// Public settings names come from the same table as the inspector and reference.
const settingsType = type => type === 'boolean' ? 'boolean' : type === 'number' ? 'number'
 : ['string','color'].includes(type) ? 'string' : /^"[^\n]+"$/.test(type) ? type
 : ['number[]','string[]','[number, number]','[number, number, number]'].includes(type) ? type : 'unknown';
const runtimeSettings = '// Generated from the options table; do not edit.\nexport interface RuntimeSettingsMap {\n' +
 Object.keys(optionsTable.components).map(name => '  ' + name + ': {\n' +
 componentOptions(name).filter(option => option.setting && takes(option, 'js')).map(option =>
 '    ' + option.name + '?: ' + settingsType(option.type) + ';').join('\n') + '\n  };').join('\n') + '\n}\nexport type RuntimeSettings<K extends keyof RuntimeSettingsMap> = RuntimeSettingsMap[K];\n';
const generatedTypes=new Map([[path.join(root,'src/lib/charts/generated/types.ts'),chartTypes(charts,componentOptions)],
 [path.join(root,'src/lib/compound/generated/types.ts'),templateTypes(TEMPLATES,componentOptions)],
 [path.join(root,'src/lib/plugins/generated/types.ts'),pluginComponentTypes(root)]]);
generatedTypes.set(path.join(root,'src/lib/plot/generated/settings.ts'),runtimeSettings);
const compilerOptions={skipLibCheck:true,target:ts.ScriptTarget.ESNext}, host=ts.createCompilerHost(compilerOptions);
const generatedText=name=>generatedTypes.get(path.resolve(name));
const {getSourceFile,readFile,fileExists}=host;
Object.assign(host,{getSourceFile:(name,language,...rest)=>generatedText(name)!==undefined?ts.createSourceFile(name,generatedText(name),language):getSourceFile.call(host,name,language,...rest),
 readFile:name=>generatedText(name)??readFile.call(host,name),fileExists:name=>generatedText(name)!==undefined||fileExists.call(host,name)});
const checkFile=path.join(root,'src/lib/check.ts');
const program=ts.createProgram([file,checkFile,...generatedTypes.keys()],compilerOptions,host);
const checker=program.getTypeChecker(), source=program.getSourceFile(file);
const declarations=new Map([source,program.getSourceFile(checkFile),...[...generatedTypes.keys()].map(name=>program.getSourceFile(name))].flatMap(unit=>unit.statements.filter(s=>s.name).map(s=>[s.name.text,s])));
const regenerate='python3 scripts/generate-python-api.py (runs node scripts/generate-python-signatures.mjs for all generated API files)';
const registry=apiMetadata(root,optionsTable,await pluginParameterSchemas());
const snake=s=>s==='as'?'as_':s==='for'?'target':s.replace(/([A-Z]+)([A-Z][a-z])/g,'$1_$2').replace(/([a-z0-9])([A-Z])/g,'$1_$2').toLowerCase();
// Mirrors hmplot.core.camel and the target->for rule in Node._set.
const guideTargets=new Set(['Legend','Minimap']);
const camel=(python,kind)=>{
 if(python==='target')return guideTargets.has(kind)?'for':'target';
 if(python==='as_')return 'as';
 const [head,...rest]=python.split('_');return head+rest.map(s=>s.slice(0,1).toUpperCase()+s.slice(1)).join('');
};
// Construction-only keywords Node.__init__ consumes before property validation.
const constructorOnly=new Set(['filename','export_options']);
// TypeScript types with a Python class of their own. ArrayBufferView (a typed array) is a NumPy
// array in Python.
const pythonClasses={Expression:'Expression',CategoricalScale:'CategoryScale',ContinuousScale:'ContinuousScale',
 SelectionResource:'SelectionResource',DataIdentity:'IdentityResource',ThemeResource:'ThemeResource',
 LiteralValue:'Literal',RgbChannels:'Rgb',AnimatedChannel:'Animate',ArrayBufferView:'np.ndarray',
 ConnectDescriptor:'Connect',EndpointDescriptor:'Endpoint',Date:'datetime.date'};
// Data values, not options: their dict keys are not converted or checked at run time.
const valueObjects=new Set(['DictionaryColumn']);
// Property types lose the alias name, so a channel is recognized by its members.
const channelType=checker.getTypeAtLocation(declarations.get('Channel'));
const isChannel=t=>{
 const members=t.isUnion()?t.types.filter(m=>!(m.flags&(ts.TypeFlags.Undefined|ts.TypeFlags.Null))):[t];
 return t===channelType||members.length===channelType.types.length&&members.every(m=>channelType.types.includes(m));
};
const keywords=new Set('False None True and as assert async await break class continue def del elif else except finally for from global if import in is lambda nonlocal not or pass raise return try while with yield'.split(' '));
const componentNames=new Set(Object.keys(registry.components));
const stubNames=new Set(['Channel','Literal','Column','Rgb','Animate','Expression','Table','Node','Scene','Template','Connect','Endpoint','Colormap','Any']);
// Object types the stub spells out as TypedDicts (TODO 34.4b), with snake_case keys. Python
// converts and checks the keys of a dict given for them at run time (34.4c, registry.objects):
// name -> {keys: [[camel key, Python annotation, required, nested object names]]}.
const objects=new Map(), objectNames=new Map();
// Here is publicTypes.ts and the generated props types beside it.
const declaredHere=t=>(t.aliasSymbol??t.symbol)?.declarations?.some(d=>{const unit=d.getSourceFile();return unit===source||generatedText(unit.fileName)!==undefined;});
const namedHere=t=>declarations.has(t.aliasSymbol?.name??t.symbol?.name);
const pascal=s=>s.slice(0,1).toUpperCase()+s.slice(1);
// Union members in a fixed order (plain types, literal sets, sequences, classes, dicts), not in
// TypeScript's, which follows the order its types were created and so moves with unrelated edits.
const rank=part=>/^(float|str|bool)$/.test(part)?0:part.startsWith('TypingLiteral[')?1
 :/^(list|tuple|Sequence)\[/.test(part)?2:part.startsWith('dict[')?4:3;
const ordered=parts=>parts.map((part,i)=>[part,i]).sort(([a,i],[b,j])=>rank(a)-rank(b)||i-j).map(([part])=>part);
/** A plain object of named keys (an options dict), not an array, function, handle or record. */
function closedObject(t){
 if(!(t.flags&ts.TypeFlags.Object)||checker.isArrayType(t)||checker.isTupleType(t))return false;
 if(t.getCallSignatures().length||t.getConstructSignatures().length||checker.getIndexInfosOfType(t).length)return false;
 const props=checker.getPropertiesOfType(t);
 return props.length>0&&props.every(p=>/^[A-Za-z_]\w*$/.test(p.name)&&!(p.flags&ts.SymbolFlags.Method))&&declaredHere(t);
}
function objectAnnotation(t,hints){
 if(objectNames.has(t))return objectNames.get(t);
 const own=t.aliasSymbol?.name??t.symbol?.name;
 const free=name=>name&&!componentNames.has(name)&&!stubNames.has(name)&&!objects.has(name);
 const name=[own&&declarations.has(own)?own:null,...hints].find(free);
 const members=checker.getPropertiesOfType(t);
 if(!name||members.some(p=>keywords.has(snake(p.name))))return 'dict[str, Any]';
 objectNames.set(t,name);
 const keys=[];
 objects.set(name,{keys});
 for(const member of members){
  const nested=new Set();
  const type=checker.getTypeOfSymbol(member), key=member.name;
  const text=annotation(type,[`${name}${pascal(key)}`],nested);
  if(text===null)continue;
  keys.push([key,text,!(member.flags&ts.SymbolFlags.Optional),[...nested]]);
 }
 return name;
}
/**
 * The Python annotation of a TypeScript type. `hints` name an anonymous object type (the
 * first free one); `nested` collects the object types reached, for registry.objects. Returns
 * null for what Python cannot pass (functions, GPU arrays), which a union then leaves out.
 */
function annotation(t,hints=[],nested=new Set()){
 if(t.flags & (ts.TypeFlags.Any|ts.TypeFlags.Unknown)) return 'Any';
 if(isChannel(t))return 'Channel';
 if(t.isUnion()){
  const types=t.types.filter(t=>!(t.flags&(ts.TypeFlags.Undefined|ts.TypeFlags.Null)));
  const literals=types.filter(t=>t.isStringLiteral()).map(t=>JSON.stringify(t.value));
  // A union alias names its one anonymous object (ColormapSpec); several are told apart by
  // their first key (FacetFieldsRow, FacetFieldsColumn).
  const anonymous=types.filter(m=>closedObject(m)&&!namedHere(m));
  const alias=namedHere(t)&&anonymous.length===1?[t.aliasSymbol.name]:[];
  const memberHints=m=>anonymous.length>1&&anonymous.includes(m)
   ?hints.map(h=>h.replace(/Options$/,'')+pascal(checker.getPropertiesOfType(m)[0].name)):[...alias,...hints];
  const parts=types.filter(t=>!t.isStringLiteral()).map(t=>annotation(t,memberHints(t),nested)).filter(part=>part!==null);
  if(literals.length)parts.unshift(`TypingLiteral[${literals.join(', ')}]`);
  const unique=ordered([...new Set(parts)]);
  return unique.includes('Any')?'Any':unique.join(' | ')||'Any';
 }
 if(t.flags&ts.TypeFlags.BooleanLike)return 'bool';
 if(t.flags&ts.TypeFlags.NumberLike)return 'float';
 if(t.isStringLiteral())return `TypingLiteral[${JSON.stringify(t.value)}]`;
 if(t.flags&ts.TypeFlags.StringLike)return 'str';
 if(checker.isTupleType(t)||checker.isArrayType(t)){
  const items=checker.getTypeArguments(t);
  const item=items.length?annotation(checker.getUnionType([...items]),hints,nested):'Any';
  return item===null?null:`Sequence[${item}]`;
 }
 const name=t.aliasSymbol?.name??t.symbol?.name;
 if(pythonClasses[name])return pythonClasses[name];
 if(t.getCallSignatures().length)return null;
 // A GPU array: Python passes NumPy arrays instead.
 if(name==='Array'&&!declaredHere(t))return null;
 if(closedObject(t)){
  const object=objectAnnotation(t,hints);
  if(object!=='dict[str, Any]')nested.add(object);
  return object;
 }
 // A record keyed by names the caller chooses (column names, parts): values typed, keys not.
 const index=checker.getIndexInfosOfType(t).find(info=>info.keyType.flags&ts.TypeFlags.String);
 if(index&&!checker.getPropertiesOfType(t).length){
  const value=annotation(index.type,hints,new Set());
  return value===null?'Any':`dict[str, ${value}]`;
 }
 return 'Any';
}
// Transform parameters that take a data-derived value (registry.expressionParams; Histogram
// passes its bins to a Bin) often also take arrays, rule names, or per-axis objects, which
// annotation() collapses to Any. Spell those out, so Bin.bins reads
// `float | list[float] | TypingLiteral[...] | Expression | dict[str, ...]` instead of Any.
const expressionParams=new Set(Object.entries({...registry.expressionParams,Histogram:registry.expressionParams?.Bin??[]})
 .flatMap(([kind,props])=>props.map(prop=>`${kind}.${prop}`)));
function detailed(t){
 const types=(t.isUnion()?t.types:[t]).filter(t=>!(t.flags&(ts.TypeFlags.Undefined|ts.TypeFlags.Null)));
 const literals=types.filter(t=>t.isStringLiteral()).map(t=>JSON.stringify(t.value));
 const parts=[];
 for(const member of types){
  if(member.isStringLiteral())continue;
  let text;
  // Sequence, as annotation() writes them: a list is invariant, so list[float] refused [64, 64].
  if(checker.isTupleType(member))text=`Sequence[${[...new Set(checker.getTypeArguments(member).map(detailed))].join(' | ')}]`;
  else if(checker.isArrayType(member))text=`Sequence[${detailed(checker.getTypeArguments(member)[0])}]`;
  else if(annotation(member)==='Any'&&member.flags&ts.TypeFlags.Object){
   // A per-axis object such as Partial<Record<"x" | "y" | "z", ...>>: one value type.
   const values=[...new Set(checker.getPropertiesOfType(member).map(prop=>detailed(checker.getTypeOfSymbol(prop))))];
   text=values.length===1&&values[0]!=='Any'?`dict[str, ${values[0]}]`:'Any';
  }else text=annotation(member);
  if(text==='Any')return 'Any';
  parts.push(text);
 }
 if(literals.length)parts.push(`TypingLiteral[${literals.join(', ')}]`);
 return ordered([...new Set(parts)]).join(' | ')||'Any';
}
const marks=new Set(Object.entries(optionsTable.components).filter(([,spec])=>spec.mark).map(([name])=>name));
// Inputs (TODO 41): the components marked input: true, named values the viewer sets.
const inputs=new Set(Object.entries(optionsTable.components).filter(([,spec])=>spec.input).map(([name])=>name));
// Input contexts: the components marked inputContext: true (a Scene, an InputContext, a
// Template), each a scope its inputs are read in by name.
const inputContexts=Object.entries(optionsTable.components).filter(([,spec])=>spec.inputContext).map(([name])=>name);
// A component's `positional` names the prop Python's positional arguments set; Node.__init__,
// hmplot/__init__.py and the stubs below handle these three.
for(const [name,{positional}] of Object.entries(registry.components))
 if(positional&&!['value','plots','text'].includes(positional))
  throw Error(`src/lib/scene/options.json: ${name} has positional "${positional}"; positional arguments set "value" (then children), "plots" or "text".`);
const header=fs.readFileSync(path.join(root,'scripts/python-api-header.pyi'),'utf8');
const classes=[], moduleClasses={ charts: [], stats: [] };
// Names the maintained header binds must not be reused by generated object types.
for(const [,names] of header.matchAll(/^from \.\w* import \(?([^)]+?)\)?$/gm))
 for(const part of names.split(','))if(part.trim())stubNames.add(part.trim().split(/\s+as\s+/).pop());
for(const match of header.matchAll(/^(?:def|class) (\w+)|^(\w+)\s*[:=]/gm))stubNames.add(match[1]??match[2]);
// Each component's options come from the options table (src/lib/scene/options.json, R2.0b): its
// keywords, their order and their docs. A keyword the TypeScript props declare takes its Python
// annotation from them; any other from the table's type.
// A component's TypeScript props type: <Name>Props, or the table's `props` (Points takes MarkProps).
const propsType=name=>optionsTable.components[name]?.props??`${name}Props`;
const plain={boolean:'bool',number:'float',string:'str',color:'str',dict:'dict[str, Any]','[number, number]':'Sequence[float]',
 '[number, number, number]':'Sequence[float]','number[]':'Sequence[float]','string[]':'Sequence[str]'};
const tableAnnotation=type=>{
 if(plain[type])return plain[type];
 const literals=type.split(' | ');
 return literals.every(part=>/^"[^"]*"$/.test(part))?`TypingLiteral[${literals.join(', ')}]`:'Any';
};
// Python data is also a Table or a DataFrame, which the TypeScript DataTable does not cover; a
// Table carries its key and schema.
const pythonData=new Set(['data','key','schema']);
const signatures={}, componentProperties={}, objectProps={}, declared=new Map(), settingsOf=new Map(), keywordDocs=new Map();
// Python's layout grid is hm.Grid (R2.0), beside Row and Column; the scene names it LayoutGrid.
const pythonNames={LayoutGrid:'Grid'};
for(const name of Object.keys(registry.components)){
 // Scene, Template and Slot have hand-written classes and stubs (core.py, core.pyi).
 if(['Scene','Template','Slot'].includes(name))continue;
 if(!componentTakes(name,'python')) {
  componentProperties[name]=componentOptions(name).filter(option=>!option.setting).map(option=>option.name).sort();
  continue;
 }
 const options=componentOptions(name).filter(option=>takes(option,'python'));
 const decl=declarations.get(propsType(name));
 const props=new Map(decl?checker.getPropertiesOfType(checker.getTypeAtLocation(decl)).map(prop=>[prop.name,prop]):[]);
 const params=new Map();
 for(const option of options.filter(option=>!option.setting)){
  const key=option.name, python=option.python, prop=props.get(key);
  let text=null;
  if(prop&&!(pythonData.has(key)&&['Plot','Facet','Data','Nodes'].includes(name))&&!(key==='value'&&['Data','Theme'].includes(name))){
   const type=checker.getTypeOfSymbolAtLocation(prop,decl), nested=new Set();
   // An anonymous options object is named after its property: plainly when a shared base such
   // as MarkProps declares it (BrushOptions), else with the component's name (PlotLegendOptions).
   const own=prop.declarations?.[0]?.parent?.name?.text===propsType(name)&&!optionsTable.components[name]?.props;
   const hints=own?[`${name}${pascal(key)}Options`]:[`${pascal(key)}Options`,`${name}${pascal(key)}Options`];
   text=expressionParams.has(`${name}.${key}`)?detailed(type):annotation(type,hints,nested);
   const objectTypes=[...nested].filter(object=>!valueObjects.has(object));
   if(objectTypes.length)(objectProps[name]??={})[key]=objectTypes;
  }else if(!prop)text=tableAnnotation(option.type);
  params.set(python,text??'Any');
  keywordDocs.set(`${name}.${python}`,option);
 }
 // Settings (TODO 40.2) are typed Any: their types live in the settings registry (option
 // types), which the stubs do not read; a misspelled name is still an error.
 const settings=options.filter(option=>option.setting);
 for(const option of settings)keywordDocs.set(`${name}.${option.python}`,option);
 settingsOf.set(name,settings.map(option=>option.name));
 componentProperties[name]=options.filter(option=>!option.setting&&!constructorOnly.has(option.python)).map(option=>option.name).sort();
 declared.set(name,params);
}
// Mapping hands the marks inside it the channels and options utils/mapping.js lets each kind
// inherit; Python takes those too.
{
 const {resolveMappings}=await import(pathToFileURL(path.join(root,'src/lib/plot/utils/mapping.js')).href);
 const names=[...new Set([...marks].flatMap(mark=>[...(componentProperties[mark]??[]),...(settingsOf.get(mark)??[])]))];
 const layer=Object.fromEntries(names.map(option=>[option,0]));
 const passed=new Set([...marks].flatMap(kind=>Object.keys(resolveMappings(kind,[layer],{}).values)));
 const own=new Set(componentProperties.Mapping);
 settingsOf.set('Mapping',[...passed].filter(option=>!own.has(option)&&option!=='data').sort());
}
const settingName=option=>snake(option);
/** A keyword's line in the Args section: its sentence, then its default and units. */
const pythonValue=value=>value===true?'True':value===false?'False':value===null?'None':Array.isArray(value)?`[${value.map(pythonValue).join(', ')}]`:JSON.stringify(value);
const keywordDoc=option=>{
 const parts=[inLanguage(option.doc,'python')];
 // Units follow a number: `Default: 8 px.`; a default in words reads alone.
 const value=option.default!==undefined?pythonValue(option.default):option.defaultText;
 const numeric=[option.default].flat().every(item=>typeof item==='number');
 if(value!==undefined)parts.push(`Default: ${value}${option.units&&numeric?` ${option.units}`:''}.`);
 if(option.units&&!(value!==undefined&&numeric))parts.push(`In ${option.units}.`);
 return parts.filter(Boolean).join(' ');
};
const wrap=(text,width,indent)=>text.split(' ').reduce((lines,word)=>{const last=lines.at(-1);
 if(last!==undefined&&(last+' '+word).length<=width)lines[lines.length-1]=last+' '+word;else lines.push(word);return lines;},[]).join(`\n${indent}`);
// Each component's example (R2.5): the Python program its reference page opens with,
// src/examples/<page>-basic/<page>-basic.py, which python/tests/test_api_consistency.py runs.
const {apiEntries}=await import(pathToFileURL(path.join(root,'src/routes/examples/api.js')).href);
const exampleOf=name=>{
 const entry=apiEntries.find(item=>item.component===name&&!item.hidden);
 const id=entry&&`${entry.aliasOf??entry.id}-basic`, file=id&&path.join(root,'src/examples',id,`${id}.py`);
 if(!file||!fs.existsSync(file))throw Error(`${name} has no reference example: add src/examples/${id}/${id}.py (R2.0b.2).`);
 return fs.readFileSync(file,'utf8').trimEnd().split('\n').map(line=>line?`            ${line}`:'').join('\n');
};
for(const [name,params] of declared){
 const settings=settingsOf.get(name).map(option=>[settingName(option),'Any']), python=pythonNames[name]??name;
 const advanced = key => !!keywordDocs.get(`${name}.${key}`)?.advanced;
 const ordered = [...params,...settings].sort(([a], [b]) => Number(advanced(a)) - Number(advanced(b)));
 signatures[name]=Object.fromEntries(ordered);
 let beganAdvanced = false;
 const signature=ordered.map(([key,type]) => {
   const heading = advanced(key) && !beganAdvanced ? '        # Advanced renderer options:\n' : '';
   beganAdvanced ||= advanced(key);
   return `${heading}        ${key}: ${type} = ...,`;
 }).join('\n');
 // Hand-written members (hmplot/__init__.py) the generated class does not have.
 // A Provider's events also include its load and error; a Playback plays (TODO 41.4).
 const extra=name==='Simulate'?'    step_count: int\n    running: bool\n    settled: bool\n'
  :name==='Playback'?'    playing: bool\n    def play(self) -> None: ...\n    def pause(self) -> None: ...\n    def reset(self) -> None: ...\n'
  :name==='Plot'?'    @property\n    def description(self) -> str | None: ...\n'
  :name==='Provider'?'    params: dict[str, Any]\n    async def refresh(self, *, view: Any = ..., timeout: float = ...) -> None: ...\n'+
  '    def on_event(self, event: TypingLiteral["click", "dblclick", "pointermove", "pointerenter", "pointerleave", "contextmenu",\n'+
  '        "camerachange", "viewportchange", "load", "error"], callback: _Callback) -> _Callback: ...\n':'';
 // What positional arguments are (TODO 40.3), from the options table's `positional`, the prop
 // they set: Data's value (the data), then children; LinkViews' plots, which are references;
 // Title's and Markdown's text. Otherwise a container's children; nothing for any other component.
 const {container,positional:role}=registry.components[name]??{};
 const [positional,doc]=role==='value'?['*children: Any,','The first positional argument may be the data (a Table or DataFrame); the others are its children.']
  :role==='plots'?['*plots: Node,','Positional arguments are the plots to link. They are references: each stays where it is.']
  :role==='text'?['__text: str = ..., /, *,','The positional argument is the text (or text=): hm.'+name+'("...").']
  :container?['*children: Node,',"Positional arguments are this component's children and move into it. Keywords that take a component (target=) refer to it without moving it."]
  :['*,',null];
 // The docstring (R2.0b): the component's summary, what positional arguments are, and each
 // keyword's sentence from the options table, so editors show them on hover.
 const keywords=ordered.map(([key])=>key).filter(k=>keywordDocs.get(`${name}.${k}`)?.doc);
 const summary=optionsTable.components[name]?.summary;
 const paragraphs=[inLanguage(summary,'python'),doc].filter(Boolean).map(text=>wrap(text,88,'        '));
 const args=keywords.length?'Args:\n'+keywords.map(k=>`            ${wrap(`${k}: ${keywordDoc(keywordDocs.get(`${name}.${k}`))}`,80,'                ')}`).join('\n'):'';
 const example=`Example:\n${exampleOf(name)}`;
 // Backslashes as written ("\n" in a keyword's doc, TeX in an example), not escapes.
 const body=[...paragraphs,example,args].filter(Boolean).join('\n\n        ').replace(/\\/g,'\\\\');
 // Every keyword is listed (TODO 40.2), so a misspelled one is a type error. Calculate's other
 // keywords are its output columns (hm.Calculate(smoothed=...)).
 const rest=name==='Calculate'?'\n        **outputs: Any,':name==='Transform'?'\n        **parameters: Any,':'';
 // A component with no keywords (InputContext) takes none: a bare * needs a keyword after it.
 const keywordsOf=list=>list||rest?`\n${list}${rest}\n    `:'';
 const opening=signature||rest?` ${positional}`:positional==='*,'?'':` ${positional.replace(/,$/,'')}`;
 const init=`    def __init__(self,${opening}${keywordsOf(signature)}) -> None:${body?`\n        \"\"\"${body}\n        \"\"\"`:' ...'}`;
 // Inputs (TODO 41) are hm.Input: a value synced from the browser, and on_change.
 // Data and the transforms chain (TODO 144, pipeline.py): sales.filter(...).group_by(...).agg(...).
 const base=inputs.has(name)?'Input':name==='Data'||optionsTable.components[name]?.group==='Transforms'?'_Pipeline':'Node';
 const definition=`class ${python}(${base}):\n${init}\n    def update(self${signature||rest?', *,':''}${keywordsOf(signature)}) -> Self: ...\n${extra}`;
 (moduleClasses[optionsTable.components[name]?.tier] ?? classes).push(definition);
}
// Channel: what a mark channel accepts (publicTypes.ts Channel), as Python spells it, plus
// hm.column(...). The TypedDicts: every object type the signatures reach, in snake_case.
const channelParts=channelType.types.map(t=>annotation(t,['DictionaryColumn'])).filter(part=>part!==null);
// A pandas or Polars Series (anything with __array__) converts like a NumPy array (TODO 40.1).
const channel=[...new Set([...channelParts,'Column','SupportsArray'])].join(' | ');
// Only the TypedDicts a signature reaches (an overridden keyword, such as Plot's axes=True, leaves
// its object type unused).
const used=new Set(), pending=[channel,...Object.values(signatures).flatMap(Object.values)];
while(pending.length)for(const word of pending.pop().match(/\w+/g)??[])
 if(objects.has(word)&&!used.has(word)){used.add(word);pending.push(...objects.get(word).keys.map(([,text])=>text));}
for(const name of [...objects.keys()])if(!used.has(name))objects.delete(name);
// Each TypedDict's docstring (R2.5): its TypeScript doc, when the type is declared with one, and
// the keywords (and other dicts' keys) that take it.
const takers=new Map(), taker=(type,text)=>{if(!takers.has(type))takers.set(type,[]);takers.get(type).push(text);};
for(const [component,props] of Object.entries(objectProps))for(const [prop,types] of Object.entries(props))
 for(const type of types)taker(type,`${pythonNames[component]??component}(${snake(prop)}=...)`);
for(const [name,{keys}] of objects)for(const [key,,,nested] of keys)for(const type of nested)taker(type,`${name}'s ${snake(key)}`);
const typedDictDoc=name=>{
 const declared=declarations.get(name), own=declared&&ts.displayPartsToString(checker.getSymbolAtLocation(declared.name)?.getDocumentationComment(checker)??[])
  .replace(/\s+/g,' ').replace(/ ?\((?:TODO|Stage|R\d)[^)]*\)/g,'').trim();
 const list=[...new Set(takers.get(name)??[])], shown=list.slice(0,4);
 const users=list.length?`Taken by ${shown.join(', ')}${list.length>shown.length?` and ${list.length-shown.length} more`:''}.`:'';
 const text=[own&&inLanguage(own,'python'),users].filter(Boolean).join(' ');
 return text?`    """${wrap(text.replace(/\\/g,'\\\\'),92,'    ')}"""\n`:'';
};
const typedDicts=[...objects].map(([name,{keys}])=>`class ${name}(TypedDict, total=False):\n${typedDictDoc(name)}${
 keys.map(([key,text,required])=>`    ${snake(key)}: ${required?`Required[${text}]`:text}`).join('\n')||'    pass'}`);
// A runtime module, so hm.AxisDefinition and friends exist where the stub says they do.
const typeNames=['Channel','SupportsArray',...objects.keys()];
const typesModule=`"""Types for type checkers and editors: what a mark channel accepts, and the dicts that options
such as Plot(x=...) and Frame(placement=...) take. Generated by scripts/generate-python-signatures.mjs
from src/lib/plot/publicTypes.ts; do not edit.

Keys are snake_case; at run time a dict option also accepts camelCase keys, and rejects keys its
type does not list (core._object_value).
"""
from __future__ import annotations
from collections.abc import Sequence
from typing import Any, Literal as TypingLiteral, Protocol, Required, TypeAlias, TypedDict
import datetime
import numpy as np
from .connections import Connect, Endpoint
from .data import Animate, CategoryScale, Column, ContinuousScale, IdentityResource, Literal, Rgb, SelectionResource, ThemeResource
from .expressions import Expression

__all__ = [
${typeNames.map(name=>`    ${JSON.stringify(name)},`).join('\n')}
]


${typedDicts.join('\n\n\n')}


class SupportsArray(Protocol):
    \"\"\"Anything NumPy converts to an array: a pandas or Polars Series, a pandas Index, an xarray
    DataArray. It converts as the same column of a Table does; device arrays (torch, jax, cupy)
    are refused at run time.\"\"\"
    def __array__(self, *args: Any, **kwargs: Any) -> np.ndarray: ...


# What a mark channel (x, y, fill, size, ...) accepts.
Channel: TypeAlias = ${channel}
`;
const generated=`# Generated types (scripts/generate-python-signatures.mjs): hmplot/_types.py.\nfrom ._types import (\n${typeNames.map(name=>`    ${name} as ${name},`).join('\n')}\n)\n# End of generated types.\n`;
const stub=header+generated+'\nfrom . import charts as charts, stats as stats\n'+classes.join('\n');
const moduleHeader = `# Generated by scripts/generate-python-signatures.mjs; do not edit.
from typing import Any, Callable, Awaitable, Literal as TypingLiteral, Self
from collections.abc import Sequence
from pathlib import Path
import datetime
import numpy as np
from .core import Node, Callback as _Callback
from .pipeline import Pipeline as _Pipeline
from .data import Table, Literal, Rgb, Animate, CategoryScale, OrdinalScale, ContinuousScale, SelectionResource, IdentityResource
from .expressions import Expression
from .connections import Connect, Endpoint
`;
const moduleStubs=Object.entries(moduleClasses).map(([name, definitions]) => [path.join(root, `python/hmplot/${name}.pyi`), moduleHeader+generated+'\n'+definitions.join('\n')]);
// Public names come from the options table and TypeScript declarations only. Settings
// aliases are converted before per-component validation; implementation names never enter here.
const nextRegistry=structuredClone(registry);
// The mark set is the one source for the Python mark lists (core.DISPLAYABLE_MARKS, introspection).
nextRegistry.marks=[...marks].sort();
// The input set is the one source for the input kinds in Python (core.INPUT_KINDS) and the scene
// runtime (SceneNode.svelte, runtime.svelte.js).
nextRegistry.inputs=[...inputs].sort();
// Likewise the input contexts (core._INPUT_CONTEXTS, SceneNode.svelte, runtime.svelte.js).
nextRegistry.inputContexts=[...inputContexts].sort();
// Dict-valued options (TODO 34.4c): each object type's camelCase keys, with the object types a
// key's value may be, and which component properties take which object types. Python converts
// snake_case keys and rejects unknown ones with these (core._object_value).
nextRegistry.objects=Object.fromEntries([...objects].map(([name,{keys}])=>[name,Object.fromEntries(keys.map(([key,,,nested])=>[key,nested]))]));
nextRegistry.objectProps=Object.fromEntries(Object.entries(objectProps).filter(([,props])=>Object.keys(props).length));
// Connection names (Stage 15): Python validates connect()/endpoint() against the renderer's own
// lists, so hm.connect raises the same errors for the same inputs as connect() in JavaScript.
const connections=await import(pathToFileURL(path.join(root,'src/lib/plot/utils/connections.js')).href);
nextRegistry.connections={
 version:connections.CONNECT_VERSION,
 kinds:[...connections.CONNECTION_KINDS],
 endpointKinds:[...connections.ENDPOINT_KINDS],
 compoundEndpointKinds:[...connections.COMPOUND_ENDPOINT_KINDS],
 channels:[...connections.CONNECTION_CHANNELS],
 orders:[...connections.ORDERS],
 attachments:Object.fromEntries(Object.entries(connections.ATTACHMENTS).map(([kind,table])=>[kind,{default:table.default,names:connections.attachmentNames(kind)}])),
 deferred:{...connections.DEFERRED_ENDPOINTS},
};
// The mark kinds theme.marks accepts (TODO 130.2: the built-in templates' theme kinds among
// them): python/hmplot/data.py validates themes with the renderer's list.
nextRegistry.themeKinds=[...(await import(pathToFileURL(path.join(root,'src/lib/plot/utils/themeKinds.js')).href)).MARK_KINDS].sort();
// Facet fields/pairs (TODO 21 F5): python/hmplot/core.py checks the structural rules with
// these texts ({name} placeholders filled the same way as facetSpec.js facetError).
const facetSpec=await import(pathToFileURL(path.join(root,'src/lib/plot/utils/facetSpec.js')).href);
nextRegistry.facet={errors:{...facetSpec.FACET_SPEC_ERRORS},triangles:[...facetSpec.FACET_TRIANGLES]};
// A component's runtimeOptions are its settings (above). Scene has a hand-written class; its
// options are the table's too.
const layoutProperties={Scene:componentOptions('Scene').map(option=>option.name).sort(),Template:[],Slot:[]};
// Where a "$name" string reads an input (TODO 41), from the options table: an option marked
// "input" (a mark's channels; the column, choice and string properties of transforms, facets
// and graph layouts, such as Sort's by and Tree's orientation), and every value and setting but
// the name of a component marked inputs: "all" (Mapping). Elsewhere a string is literal
// (title="$GDP" is a title); hm.input.x reads anywhere. A table (a Join's data=) is data: its
// text is never an input read.
const stringReads=name=>{
 if(!declared.get(name))return [];
 if(optionsTable.components[name]?.inputs==='all')
  return [...new Set([...declared.get(name).keys(),...settingsOf.get(name).map(settingName)].filter(key=>key!=='name').map(key=>camel(key,name)))].sort();
 return componentOptions(name).filter(option=>option.input).map(option=>option.name).sort();
};
// Each component's group (R2.0b): the task it serves, from the options table. It organizes the
// reference and colors hm.visualize_tree.
const ungrouped=Object.keys(registry.components).filter(name=>!optionsTable.components[name]?.group);
if(ungrouped.length)throw Error(`src/lib/scene/options.json has no group for ${ungrouped.join(', ')}`);
for(const [name,component] of Object.entries(registry.components)){
 const {runtimeOptions,...rest}=component, properties=componentProperties[name]??layoutProperties[name];
 const extra=settingsOf.get(name)??[], reads=stringReads(name);
 nextRegistry.components[name]={...rest,group:optionsTable.components[name].group,...(properties?{properties}:{}),
  ...(extra.length?{runtimeOptions:extra}:{}),...(reads.length?{stringReads:reads}:{})};
}
nextRegistry.properties=[...new Set(Object.values(nextRegistry.components).flatMap(component=>
 [...component.properties,...(component.runtimeOptions??[])]))].sort();
const registryText=JSON.stringify(nextRegistry,null,2)+'\n';
// The reference's type pages (R2.0b.2): the members of the option objects and handles they
// document, with their TypeScript docs. It replaces a hand-kept copy of publicTypes.ts.
const documentedTypes=['InspectionOptions','PlotInspection','InspectionReport','ScreenMapping','LightSpec','AxisDefinition','ReferenceRule','ReferenceBand','TooltipOptions','FramePlacement','ThemeDefinition',
 'DocumentExportOptions','PlotHandle','TransformHandle','DictionaryColumn','ContinuousScaleConfig','SelectionResource',
 'DataIdentity','ConnectOptions','CameraState','Viewport2D',
 'ReductionOptions','OrderedReductionOptions','OrderedExpressionOptions','NeighborExpressionOptions','WindowExpressionOptions'];
// Plan references (TODO 46, R2.0) are for the maintainers, not the page.
const docText=symbol=>ts.displayPartsToString(symbol?.getDocumentationComment(checker)??[]).replace(/\s+/g,' ')
 .replace(/ ?\((?:TODO|Stage|R\d)[^)]*\)/g,'').replace(/; TODO \d[\w.]*/g,'').trim();
const typeDocs=Object.fromEntries(documentedTypes.map(name=>{
 const decl=declarations.get(name), type=checker.getTypeAtLocation(decl);
 const members=checker.getPropertiesOfType(type).map(member=>({name:member.name,
  type:checker.typeToString(checker.getTypeOfSymbolAtLocation(member,decl),undefined,ts.TypeFormatFlags.NoTruncation).replace(/ \| undefined$/,''),
  ...(member.flags&ts.SymbolFlags.Optional?{}:{required:true}),doc:docText(member)}));
 return [name,{doc:docText(checker.getSymbolAtLocation(decl.name)),members}];
}));
const modules=Object.entries(registry.components).filter(([,component])=>component.module);
const componentsModule='// Generated component imports: a scene loads only the kinds it contains.\nexport const componentLoaders = {\n'+
 modules.map(([name,{module}])=>`  ${name}: () => import("../${module.replace(/^\.\//,'')}"),`).join('\n')+'\n};\n';
const outputAt=process.argv.indexOf('--output-dir');
const outputDir=outputAt<0?root:path.resolve(process.argv[outputAt+1]);
const outputs = new Map([
 [path.join(root,'src/lib/plot/generated/settings.ts'),runtimeSettings],
 [path.join(root,'src/lib/scene/components.js'),componentsModule],
 [path.join(root,'src/routes/content/reference/types.json'),JSON.stringify(typeDocs,null,1)+'\n'],
 [path.join(root,'python/hmplot/__init__.pyi'),stub],
 ...moduleStubs,
 [path.join(root,'python/hmplot/signatures.json'),JSON.stringify(signatures,null,2)+'\n'],
 [path.join(root,'python/hmplot/_types.py'),typesModule],
 [path.join(root,'python/hmplot/registry.json'),registryText],
 [path.join(root,'src/lib/scene/registry.json'),registryText],
 ...pluginComponentOutputs(root).map(([file,content])=>[path.join(root,file),content]),
 ...chartOutputs(charts,TEMPLATES,coreTable,registry,componentOptions).map(([file,content])=>[path.join(root,file),content]),
].map(([file,content])=>[path.join(outputDir,path.relative(root,file)),content]));
// The JavaScript and Python packages release in lockstep from 2.0.0.
const jsVersion=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8')).version;
const pyVersion=/^version = "([^"]+)"/m.exec(fs.readFileSync(path.join(root,'python/pyproject.toml'),'utf8'))?.[1];
if(jsVersion!==pyVersion){console.error(`package.json version ${jsVersion} differs from python/pyproject.toml ${pyVersion}.`);process.exitCode=1;}
// Consistency, both ways: each registry copy against what the stubs advertise (per
// component) and against all declared properties/settings (the flat list, shown as `*`).
function registryDifferences(disk){
 const lines=[], diff=(label,generated,listed)=>{
  for(const name of generated)if(!listed.has(name))lines.push(`${label}.${name}: stub-only`);
  for(const name of listed)if(!generated.has(name))lines.push(`${label}.${name}: registry-only`);
 };
 const names=new Set([...Object.keys(nextRegistry.components),...Object.keys(disk.components??{})]);
 for(const name of names)diff(name,new Set(componentProperties[name]??layoutProperties[name]??[]),new Set(disk.components?.[name]?.properties??[]));
 diff('*',new Set(nextRegistry.properties),new Set(disk.properties??[]));
 return lines;
}
if(process.argv.includes('--print-registry')){
 console.log(registryText);
}else if(process.argv.includes('--check')){
 // --registry FILE (repeatable) checks those registry copies instead of the tracked ones.
 const registryFiles=process.argv.flatMap((arg,i,args)=>arg==='--registry'&&args[i+1]?[path.resolve(args[i+1])]:[]);
 const checked=registryFiles.length
  ?[...[...outputs].filter(([file])=>!file.endsWith('registry.json')),...registryFiles.map(file=>[file,registryText])]
  :[...outputs];
 let consistent=true;
 for(const [file] of checked.filter(([file])=>file.endsWith('registry.json'))){
  let disk;
  try{disk=JSON.parse(fs.readFileSync(file,'utf8'));}catch{continue;}
  const lines=registryDifferences(disk);
  if(lines.length){
   consistent=false;
   console.error(`${path.relative(root,file)} disagrees with the generated stubs (stub-only: advertised but not listed; registry-only: listed but no longer generated; * is the flat property list):\n  ${lines.join('\n  ')}`);
  }
 }
 const stale=checked.filter(([file,content])=>!fs.existsSync(file)||fs.readFileSync(file,'utf8')!==content).map(([file])=>path.relative(root,file));
 if(stale.length)console.error(`Generated Python API files are stale: ${stale.join(', ')}. Regenerate with ${regenerate}.`);
 if(stale.length||!consistent)process.exitCode=1;
 else console.log(`Checked signatures for ${Object.keys(signatures).length} components.`);
}else{
 for(const [file,content] of outputs){fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,content);}
 console.log(`Generated signatures for ${Object.keys(signatures).length} components.`);
}
