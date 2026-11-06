/* The things to see on the Travel map, square by square. A square is a map tile at zoom 10 ("10/x/y"), and a
   place belongs to whichever square its point falls in. Each square lists its top things to do (eight at most):
   see them all, or mark the square as done, and it turns green.

   To add a square: add an entry to SQUARES with its name, then its places (an id that never changes, a name, a kind,
   a line about it and where it is). `cellOf(lat, lon)` says which square a point is in. */

export type Kind = "park" | "nature" | "walk" | "water" | "beach" | "wildlife" | "museum" | "history" | "art" | "lookout" | "ride" | "sport";
export type Place = { id: string; name: string; kind: Kind; about: string; lat: number; lon: number };
export type Square = { name: string; region: string; places: Place[] };

export const KIND_NAME: Record<Kind, string> = {
  park: "Park", nature: "Nature", walk: "Walk", water: "Water", beach: "Beach", wildlife: "Wildlife", museum: "Museum",
  history: "History", art: "Art", lookout: "Lookout", ride: "Ride", sport: "Sport",
};

export const Z = 1024;
export const lonX = (lon: number) => (lon + 180) / 360 * Z;
export const latY = (lat: number) => { const r = lat * Math.PI / 180; return (1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * Z; };
export const yLat = (y: number) => { const n = Math.PI - 2 * Math.PI * y / Z; return 180 / Math.PI * Math.atan(Math.sinh(n)); };
export const cellOf = (lat: number, lon: number) => `10/${Math.floor(lonX(lon))}/${Math.floor(latY(lat))}`;
/** About how wide a square is, in kilometres (they shrink further from the equator). */
export const cellKm = (y: number) => Math.round(40075 * Math.cos(yLat(y + .5) * Math.PI / 180) / Z);

const P = (id: string, name: string, kind: Kind, about: string, lat: number, lon: number): Place => ({ id, name, kind, about, lat, lon });

export const SQUARES: Record<string, Square> = {
  "10/946/593": {
    name: "Ipswich", region: "Queensland", places: [
      P("ips-queens-park", "Queens Park and Nerima Gardens", "park", "Big old trees, a playground and a calm Japanese garden with a koi pond.", -27.6170, 152.7522),
      P("ips-nature-centre", "Ipswich Nature Centre", "wildlife", "Free little zoo in Queens Park: wallabies, bush birds and a farmyard.", -27.6181, 152.7538),
      P("ips-workshops", "The Workshops Rail Museum", "museum", "Steam trains in the old railway workshops, with lots to climb on and play with.", -27.6040, 152.7630),
      P("ips-art-gallery", "Ipswich Art Gallery", "art", "Free exhibitions and a hands-on kids' space in the middle of town.", -27.6150, 152.7593),
      P("ips-amberley", "RAAF Amberley Aviation Heritage Centre", "history", "Old fighter jets and the stories of the air base (open on set days).", -27.6370, 152.7110),
      P("ips-lake-manchester", "Lake Manchester", "water", "Picnics by the water, kayaking and the bush tracks around the lake.", -27.4840, 152.7560),
      P("ips-colleges-crossing", "Colleges Crossing", "nature", "A shady riverside park on the Brisbane River for a paddle and a barbecue.", -27.5600, 152.7880),
      P("ips-rail-trail", "Brisbane Valley Rail Trail", "ride", "Ride or walk the start of Australia's longest rail trail, from Wulkuraka.", -27.6220, 152.7150),
    ],
  },
  "10/947/593": {
    name: "Brisbane", region: "Queensland", places: [
      P("bne-south-bank", "South Bank and Streets Beach", "park", "The city's lagoon beach, parklands and the river walk.", -27.4760, 153.0225),
      P("bne-cultural-centre", "Queensland Museum and GOMA", "museum", "Dinosaurs, Sparklab and the Gallery of Modern Art, side by side.", -27.4710, 153.0175),
      P("bne-lone-pine", "Lone Pine Koala Sanctuary", "wildlife", "Koalas, kangaroos to feed and platypus, by the river.", -27.5338, 152.9688),
      P("bne-coot-tha", "Mt Coot-tha Lookout", "lookout", "The whole city and Moreton Bay from the top.", -27.4848, 152.9563),
      P("bne-botanic", "Brisbane Botanic Gardens", "park", "The tropical dome, the Japanese garden and the planetarium.", -27.4757, 152.9762),
      P("bne-story-bridge", "Story Bridge climb", "sport", "Climb to the top of the bridge for the view up and down the river.", -27.4640, 153.0355),
      P("bne-citycat", "Ride a CityCat", "ride", "The fast ferry up and down the river, the best way to see the city.", -27.4680, 153.0310),
      P("bne-manly", "Manly Harbour", "water", "Boats, fish and chips and the bay breeze on the Wynnum Manly foreshore.", -27.4560, 153.1890),
    ],
  },
  "10/945/593": {
    name: "Lockyer Valley", region: "Queensland", places: [
      P("lkv-transport-museum", "Queensland Transport Museum", "museum", "Old cars, buses and trains at the Lockyer Valley Cultural Centre in Gatton.", -27.5555, 152.2775),
      P("lkv-lake-apex", "Lake Apex", "nature", "Water birds and a loop walk around the lake in Gatton.", -27.5598, 152.2700),
      P("lkv-pioneer-village", "Laidley Pioneer Village", "history", "A village of old buildings, from the slab hut to the schoolroom.", -27.6405, 152.3930),
      P("lkv-lake-dyer", "Lake Dyer", "water", "A quiet lake by Laidley for a picnic, a fish or a night's camping.", -27.6435, 152.3735),
      P("lkv-grandchester", "Grandchester Station", "history", "Queensland's first railway line began here in 1865.", -27.6630, 152.4610),
      P("lkv-clarendon", "Lake Clarendon", "nature", "Bird hides by the water, best early in the morning.", -27.5040, 152.3500),
      P("lkv-atkinson", "Atkinson Dam", "water", "Waterskiing, fishing and a big open picnic ground.", -27.4220, 152.4430),
    ],
  },
  "10/946/594": {
    name: "Springfield and Flinders Peak", region: "Queensland", places: [
      P("spr-robelle", "Robelle Domain", "park", "Big parklands, a water play area and the Orion Lagoon in Springfield.", -27.6890, 152.9060),
      P("spr-white-rock", "White Rock walk", "walk", "A bush track up to the sandstone outcrop in the conservation estate.", -27.6950, 152.8630),
      P("spr-flinders-peak", "Flinders Peak", "walk", "A steep climb to the top for views from the mountains to the sea.", -27.8173, 152.8065),
      P("spr-hardings", "Hardings Paddock", "nature", "Picnics, a creek and walks among the kangaroos.", -27.7990, 152.8130),
      P("spr-qld-raceway", "Queensland Raceway", "sport", "Watch the cars on race days at Willowbank.", -27.6910, 152.6540),
    ],
  },
  "10/948/593": {
    name: "Minjerribah (North Stradbroke Island)", region: "Queensland", places: [
      P("nsi-north-gorge", "North Gorge Walk", "walk", "Turtles, dolphins and whales in winter, from the headland at Point Lookout.", -27.4270, 153.5450),
      P("nsi-cylinder", "Cylinder Beach", "beach", "A sheltered patrolled beach, good for little ones.", -27.4260, 153.5260),
      P("nsi-brown-lake", "Brown Lake", "water", "A tea-coloured lake with soft sand for a swim.", -27.4900, 153.4320),
      P("nsi-blue-lake", "Blue Lake", "walk", "A bush walk to a deep, clear lake in the national park.", -27.5300, 153.4800),
      P("nsi-museum", "North Stradbroke Island Museum", "museum", "The island's Quandamooka history and its shipwrecks, in Dunwich.", -27.4990, 153.4010),
      P("nsi-amity", "Amity Point", "wildlife", "Dolphins by the jetty and the pelicans at the point.", -27.3990, 153.4390),
    ],
  },
};

/** Every place, by id. */
export const PLACES: Record<string, Place & { cell: string }> = Object.fromEntries(
  Object.entries(SQUARES).flatMap(([cell, s]) => s.places.map(p => [p.id, { ...p, cell }])));

/** Towns on the map, shown as you zoom in: the bigger the rank, the closer you have to be. */
export const TOWNS: [string, number, number, number][] = [
  ["Sydney", -33.87, 151.21, 0], ["Melbourne", -37.81, 144.96, 0], ["Brisbane", -27.47, 153.03, 0], ["Perth", -31.95, 115.86, 0], ["Adelaide", -34.93, 138.6, 0],
  ["Hobart", -42.88, 147.33, 0], ["Darwin", -12.46, 130.84, 0], ["Canberra", -35.28, 149.13, 0],
  ["Cairns", -16.92, 145.77, 1], ["Townsville", -19.26, 146.82, 1], ["Alice Springs", -23.7, 133.88, 1], ["Broome", -17.96, 122.24, 1],
  ["Rockhampton", -23.38, 150.51, 1], ["Gold Coast", -28.02, 153.4, 1], ["Toowoomba", -27.56, 151.95, 1], ["Kalgoorlie", -30.75, 121.47, 1],
  ["Mackay", -21.14, 149.19, 2], ["Bundaberg", -24.87, 152.35, 2], ["Sunshine Coast", -26.65, 153.07, 2], ["Newcastle", -32.93, 151.78, 2],
  ["Wagga Wagga", -35.12, 147.37, 2], ["Albury", -36.08, 146.92, 2], ["Geelong", -38.15, 144.36, 2], ["Launceston", -41.44, 147.14, 2],
  ["Mount Isa", -20.73, 139.49, 2], ["Port Hedland", -20.31, 118.6, 2], ["Geraldton", -28.78, 114.61, 2], ["Esperance", -33.86, 121.89, 2],
  ["Port Augusta", -32.49, 137.77, 2], ["Dubbo", -32.25, 148.6, 2], ["Katherine", -14.47, 132.26, 2], ["Exmouth", -21.93, 114.13, 2],
  ["Ipswich", -27.61, 152.76, 2], ["Gatton", -27.56, 152.28, 3], ["Laidley", -27.63, 152.39, 3], ["Springfield", -27.67, 152.91, 3],
  ["Point Lookout", -27.43, 153.54, 3], ["Rosewood", -27.64, 152.59, 3], ["Boonah", -28.0, 152.68, 3], ["Esk", -27.24, 152.42, 3],
];
