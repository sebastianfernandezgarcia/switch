#!/usr/bin/env python3
"""Reproduce attributed compact rail geometry from the official IGN OGC API.
Network budget 250 MB; page receipts retain checksums and original timestamps.
The graph is geometry-derived and is not an operational railway topology.
"""
import datetime,gzip,hashlib,json,math,pathlib,time,urllib.request
ROOT=pathlib.Path(__file__).resolve().parents[1]
OUT=ROOT/'.cache/ign-source-pages'
OUT.mkdir(parents=True,exist_ok=True)
PUBLIC=ROOT/'public/data'
BASE='https://api-features.idee.es/collections/'
CAP=250_000_000
network_bytes=sum(p.stat().st_size for p in OUT.glob('*-gtfs.zip'))
receipts=[]
def get_json(url,filename):
 global network_bytes
 path=OUT/filename
 if path.exists():
  raw=gzip.decompress(path.read_bytes()) if filename.endswith('.gz') else path.read_bytes()
  return json.loads(raw)
 req=urllib.request.Request(url,headers={'Accept-Encoding':'gzip','User-Agent':'SWITCH research prototype; local cartographic asset retrieval'})
 with urllib.request.urlopen(req,timeout=45) as r:
  data=r.read(CAP-network_bytes+1)
  network_bytes+=len(data)
  if network_bytes>CAP:raise RuntimeError('Technical download budget exceeded')
  raw=gzip.decompress(data) if r.headers.get('Content-Encoding')=='gzip' else data
  meta={'url':url,'retrievedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'httpStatus':r.status,'contentEncoding':r.headers.get('Content-Encoding'),'downloadBytes':len(data),'uncompressedBytes':len(raw),'sha256Uncompressed':hashlib.sha256(raw).hexdigest(),'lastModified':r.headers.get('Last-Modified')}
 path.write_bytes(gzip.compress(raw,compresslevel=6) if filename.endswith('.gz') else raw)
 (OUT/(filename+'.receipt.json')).write_text(json.dumps(meta,indent=2)+'\n')
 receipts.append(meta)
 return json.loads(raw)
def distance(a,b):
 la1,la2=map(math.radians,[a[1],b[1]]);dl=math.radians(b[0]-a[0]);dp=la2-la1
 s=math.sin(dp/2)**2+math.cos(la1)*math.cos(la2)*math.sin(dl/2)**2
 return 6371008.8*2*math.atan2(math.sqrt(s),math.sqrt(max(0,1-s)))
def simplify(points,tolerance=15):
 if len(points)<=2:return points
 mean=sum(p[1] for p in points)/len(points);cs=math.cos(math.radians(mean));xy=[(p[0]*111195.08*cs,p[1]*111195.08) for p in points]
 keep={0,len(points)-1};stack=[(0,len(points)-1)]
 while stack:
  a,b=stack.pop();ax,ay=xy[a];bx,by=xy[b];dx,dy=bx-ax,by-ay;den=dx*dx+dy*dy;best=-1;idx=None
  for i in range(a+1,b):
   px,py=xy[i];t=max(0,min(1,((px-ax)*dx+(py-ay)*dy)/den)) if den else 0
   d=(px-(ax+t*dx))**2+(py-(ay+t*dy))**2
   if d>best:best=d;idx=i
  if idx is not None and best>tolerance*tolerance:keep.add(idx);stack.extend([(a,idx),(idx,b)])
 return [points[i] for i in sorted(keep)]
get_json(BASE+'railwaylink?f=json','ign-railwaylink-collection.json')
get_json(BASE+'railwaylink/schema?f=json','ign-railwaylink-schema.json')
get_json(BASE+'railwaystationnode?f=json','ign-station-collection.json')
st=get_json(BASE+'railwaystationnode/items?f=json&limit=10000','ign-stations-raw.json')
assert len(st['features'])==st['numberMatched']
stations=[]
for f in st['features']:
 p=f['properties'];c=f['geometry']['coordinates'];stations.append({'id':f['id'],'code':p.get('stationcode'),'name':p.get('nombre'),'lon':round(c[0],7),'lat':round(c[1],7),'use':p.get('use'),'form':p.get('formofnode','').rsplit('/',1)[-1]})
nodes=[];node_index={};edges=[];seen=set();raw_points=0;output_points=0;last_dates=[]
def node(p):
 key=(round(p[0],7),round(p[1],7))
 if key not in node_index:node_index[key]=len(nodes);nodes.append([*key,round(p[2],1) if len(p)>2 else None])
 return node_index[key]
count=60018
for offset in range(0,count,5000):
 url=BASE+'railwaylink/items?f=json&limit=5000&offset='+str(offset)
 d=get_json(url,'ign-links-'+str(offset).zfill(5)+'.json.gz')
 print('page',offset,'returned',d['numberReturned'],'budgetBytes',network_bytes,flush=True)
 assert d['numberMatched']==count
 if d['numberReturned']!=min(5000,count-offset):raise RuntimeError('Incomplete page')
 for f in d['features']:
  if f['id'] in seen:raise RuntimeError('Duplicate feature across pages')
  seen.add(f['id']);p=f['properties'];g=f['geometry'];coords=g['coordinates'];raw_points+=len(coords)
  if g['type']!='LineString':raise RuntimeError('Unexpected geometry type')
  a,b=node(coords[0]),node(coords[-1]);small=simplify(coords)
  compact=[[round(c[0],7),round(c[1],7),round(c[2],1)] if len(c)>2 else [round(c[0],7),round(c[1],7)] for c in small]
  output_points+=len(compact)
  edges.append({'id':f['id'],'from':a,'to':b,'coordinates':compact,'gauge':p.get('nominalgauge'),'gaugeCategory':p.get('nominalgaugecategory'),'electrified':p.get('electrified'),'tracks':p.get('numberoftracks'),'lengthKm':round(sum(distance(x,y) for x,y in zip(coords,coords[1:]))/1000,5),'fictitious':p.get('fictitious')})
  if p.get('fecha_alta'):last_dates.append(p['fecha_alta'])
 del d
assert len(edges)==count
asset={'format':'switch-ign-rail-network-v1','source':'https://api-features.idee.es/collections/railwaylink','stationSource':'https://api-features.idee.es/collections/railwaystationnode','attribution':'Obra derivada de IGR-RT 2026 CC-BY 4.0 scne.es','license':'CC-BY-4.0','licenseUrl':'https://www.ign.es/resources/licencia/Condiciones_licenciaUso_IGN.pdf','downloadedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'scope':'All 60018 cartographic railway links returned by the official IGN collection. Includes infrastructure represented in the source; current operational status, access, permitted turns and signalling are not provided. Stations are cartographic nodes, including non-passenger facilities. No all-operator live coverage is implied.','derivation':{'geometry':'Original georeferenced lines simplified with Ramer-Douglas-Peucker15metre tolerance, no smoothing; endpoints preserved; lon/lat rounded7decimals and elevation0.1m','graph':'Exploratory2D graph from endpoint lon/lat rounded7decimals. Elevation is not used for connectivity: source elevations at coincident endpoints disagree. Original XYZ is retained on each edge; node elevation is its first supplied value. No extra spatial bridging or station connections are invented. Coincident planimetric endpoints do not establish permitted train movements.','distance':'Horizontal great-circle sum along original unsimplified points, not a railway timetable or official kilometrage','fictitious':'The INSPIRE fictitious attribute is retained as supplied; it describes cartographic representation and is not interpreted as operational availability.'},'counts':{'edges':len(edges),'nodes':len(nodes),'stations':len(stations),'originalCoordinatePoints':raw_points,'simplifiedCoordinatePoints':output_points},'latestFeatureDate':max(last_dates),'nodes':nodes,'edges':edges,'stations':stations}
PUBLIC.mkdir(exist_ok=True)
path=PUBLIC/'rail-network.json';path.write_text(json.dumps(asset,ensure_ascii=False,separators=(',',':'))+'\n')
proof={'generatedAt':asset['downloadedAt'],'source':asset['source'],'catalog':'https://datos.gob.es/es/catalogo/e0dat0002-redes-de-transporte-de-espana1','attribution':asset['attribution'],'license':asset['license'],'licenseUrl':asset['licenseUrl'],'counts':asset['counts'],'outputBytes':path.stat().st_size,'outputSha256':hashlib.sha256(path.read_bytes()).hexdigest(),'technicalDownloadBytesThisRun':network_bytes,'derivation':asset['derivation'],'allExpectedFeatureIdsDistinct':len(seen)==count,'scope':asset['scope']}
(OUT/'IGN_ASSET_PROVENANCE.json').write_text(json.dumps(proof,ensure_ascii=False,indent=2)+'\n')
print('complete',json.dumps(proof,ensure_ascii=False),flush=True)
