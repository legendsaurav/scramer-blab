(async ()=>{
  try{
    const u = 'http://localhost:5174/resources/V1.0-Dexhand/index.json';
    const res = await fetch(u);
    const r = await res.json();
    const files = r.map(f=>({name:f.name,path:`V1.0-Dexhand/${f.name}`}));
    const groups = {};
    files.forEach(f=>{
      const p = f.path.replace(/^V1\.0-Dexhand\//,'');
      const parts = p.split('/');
      const g = parts.length>1?parts[0]:'root';
      groups[g]=groups[g]||[];
      groups[g].push(f);
    });
    console.log('groups:', Object.keys(groups));
    const counts = Object.fromEntries(Object.entries(groups).map(([k,v])=>[k,v.length]));
    console.log('counts:', counts);
  }catch(e){ console.error('err', e); process.exit(1)}
})();
