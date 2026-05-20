import * as I from '../components/icons.jsx'

// Mock catalog & build data — no real branded products, generic SKUs

const COMPONENT_TYPES = [
  { key: 'cpu',     label: 'CPU',         abbr:'CPU', dot:'var(--component-cpu)', Icon: I.CPU },
  { key: 'gpu',     label: 'GPU',         abbr:'GPU', dot:'var(--component-gpu)', Icon: I.GPU },
  { key: 'mobo',    label: 'Motherboard', abbr:'MB',  dot:'#8b5cf6', Icon: I.Mobo },
  { key: 'ram',     label: 'RAM',         abbr:'RAM', dot:'#22c55e', Icon: I.RAM },
  { key: 'storage', label: 'Storage',     abbr:'SSD', dot:'#f1f5f9', Icon: I.Storage },
  { key: 'psu',     label: 'PSU',         abbr:'PSU', dot:'#eab308', Icon: I.PSU },
  { key: 'cooler',  label: 'Cooler',      abbr:'CLR', dot:'var(--component-cooler)', Icon: I.Cooler },
  { key: 'case',    label: 'Case',        abbr:'CSE', dot:'#64748b', Icon: I.Case },
];

const TYPE_COLORS = {
  cpu:     'var(--component-cpu)',
  gpu:     'var(--component-gpu)',
  mobo:    '#8b5cf6',
  ram:     '#22c55e',
  psu:     '#eab308',
  case:    '#64748b',
  storage: '#f1f5f9',
  cooler:  'var(--component-cooler)',
};

// Use-case subtitles intentionally removed; labels carry the meaning.
// `hint` is kept as an empty string for compatibility with consumers.
const USE_CASES = [
  { key:'gaming',      label:'Gaming',      hint:'', Icon: I.Gaming },
  { key:'workstation', label:'Workstation', hint:'', Icon: I.Workstation },
  { key:'office',      label:'Office',      hint:'', Icon: I.Office },
  { key:'optimal',     label:'Optimal',     hint:'', Icon: I.Optimal },
];

const CATALOG = {
  cpu: [
    { id:'cpu-01', name:'Ryzen-class 7 8C/16T 5.0GHz', price:289, spec:'AM5 · 105W TDP',  perf: 84 },
    { id:'cpu-02', name:'Ryzen-class 9 12C/24T 5.4GHz', price:489, spec:'AM5 · 170W TDP', perf: 96 },
    { id:'cpu-03', name:'Core-class i5 10C/16T 4.6GHz', price:229, spec:'LGA1700 · 125W', perf: 76 },
    { id:'cpu-04', name:'Core-class i7 14C/20T 5.2GHz', price:399, spec:'LGA1700 · 150W', perf: 90 },
    { id:'cpu-05', name:'Ryzen-class 5 6C/12T 4.7GHz', price:189, spec:'AM5 · 65W TDP',   perf: 68 },
  ],
  gpu: [
    { id:'gpu-01', name:'GeForce-class RTX 12GB',  price:549,  spec:'12GB GDDR6X · 220W', perf: 78 },
    { id:'gpu-02', name:'GeForce-class RTX 16GB',  price:899,  spec:'16GB GDDR6X · 285W', perf: 92 },
    { id:'gpu-03', name:'GeForce-class RTX 24GB',  price:1599, spec:'24GB GDDR6X · 350W', perf: 100 },
    { id:'gpu-04', name:'Radeon-class RX 16GB',    price:649,  spec:'16GB GDDR6 · 263W',  perf: 82 },
    { id:'gpu-05', name:'Radeon-class RX 8GB',     price:329,  spec:'8GB GDDR6 · 165W',   perf: 60 },
  ],
  mobo: [
    { id:'mb-01', name:'B650 Tomahawk-tier ATX', price:189, spec:'AM5 · DDR5 · PCIe 5.0' },
    { id:'mb-02', name:'X670E Carbon-tier ATX',  price:329, spec:'AM5 · DDR5 · 4x M.2' },
    { id:'mb-03', name:'B760 Pro-tier ATX',      price:179, spec:'LGA1700 · DDR5' },
    { id:'mb-04', name:'Z790 Strike-tier ATX',   price:299, spec:'LGA1700 · DDR5 · WiFi 6E' },
  ],
  ram: [
    { id:'ram-01', name:'32GB (2×16) DDR5-6000 CL30', price:119, spec:'DDR5 · 6000 MT/s' },
    { id:'ram-02', name:'64GB (2×32) DDR5-6000 CL32', price:229, spec:'DDR5 · 6000 MT/s' },
    { id:'ram-03', name:'16GB (2×8) DDR5-5600 CL36',  price:69,  spec:'DDR5 · 5600 MT/s' },
  ],
  storage: [
    { id:'st-01', name:'1TB NVMe Gen4 SSD', price:79,  spec:'PCIe 4.0 · 7000 MB/s' },
    { id:'st-02', name:'2TB NVMe Gen4 SSD', price:139, spec:'PCIe 4.0 · 7300 MB/s' },
    { id:'st-03', name:'4TB NVMe Gen4 SSD', price:269, spec:'PCIe 4.0 · 7400 MB/s' },
  ],
  psu: [
    { id:'psu-01', name:'750W Gold Modular',   price:109, spec:'80+ Gold · ATX 3.0' },
    { id:'psu-02', name:'850W Gold Modular',   price:139, spec:'80+ Gold · ATX 3.0' },
    { id:'psu-03', name:'1000W Plat. Modular', price:209, spec:'80+ Platinum · ATX 3.0' },
  ],
  cooler: [
    { id:'cl-01', name:'240mm AIO Liquid',     price:89,  spec:'Dual 120mm fans' },
    { id:'cl-02', name:'360mm AIO Liquid',     price:149, spec:'Triple 120mm fans' },
    { id:'cl-03', name:'Tower Air Dual-Tower', price:79,  spec:'2× 140mm · 260W TDP' },
  ],
  case: [
    { id:'cs-01', name:'Mid-Tower Mesh ATX',      price:99,  spec:'ATX · 4× 120mm fans' },
    { id:'cs-02', name:'Mid-Tower Glass Pro ATX', price:149, spec:'ATX · Tempered glass' },
    { id:'cs-03', name:'Compact Mini-Tower',      price:79,  spec:'mATX · Mesh front' },
  ],
};

const SAMPLE_BUILD = {
  cpu:     { ...CATALOG.cpu[0],     locked:false, compat:'ok' },
  gpu:     { ...CATALOG.gpu[1],     locked:false, compat:'ok' },
  mobo:    { ...CATALOG.mobo[0],    locked:false, compat:'ok' },
  ram:     { ...CATALOG.ram[0],     locked:false, compat:'ok' },
  storage: { ...CATALOG.storage[1], locked:false, compat:'ok' },
  psu:     { ...CATALOG.psu[1],     locked:false, compat:'ok' },
  cooler:  { ...CATALOG.cooler[0],  locked:false, compat:'ok' },
  case:    { ...CATALOG.case[0],    locked:false, compat:'ok' },
};

export { COMPONENT_TYPES, TYPE_COLORS, USE_CASES, CATALOG, SAMPLE_BUILD }
