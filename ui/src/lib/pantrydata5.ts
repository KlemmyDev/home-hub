/* A second batch: more fruit and veg, Asian and Mexican ingredients, deli, baking, lunchbox, drinks and household odds and ends. */
import * as S from "./pantryshapes";
import type { Row } from "./pantrydata1";

const W = "#fff", BLU = "#3a82e0", RED = "#e2523f", GRN = "#4cae52", YEL = "#f7d23e", ORG = "#f08a24", PUR = "#7b5cf0", PNK = "#e5487f", TEAL = "#0ea5b7", BRN = "#7a4a2a";
const stk = (d: string, c: string, w = 2) => `stroke="${c}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round" fill="${d}"`;

/* a few shapes only this batch needs */
const sheet = (c: string, lines = "#fff") => `<rect x="8" y="8" width="32" height="32" rx="3" fill="${c}"/><path d="M13 16h22M13 24h22M13 32h22" stroke="${lines}" stroke-width="1.6" opacity=".35"/>`;
const patty = (c: string) => `<ellipse cx="24" cy="30" rx="18" ry="9" fill="${c}"/><ellipse cx="24" cy="26" rx="18" ry="9" fill="${c}"/><ellipse cx="24" cy="26" rx="18" ry="9" fill="#fff" opacity=".12"/><g fill="#fff" opacity=".3"><circle cx="16" cy="26" r="1.5"/><circle cx="26" cy="23" r="1.5"/><circle cx="31" cy="28" r="1.5"/><circle cx="21" cy="30" r="1.5"/></g>`;
const balls = (c: string) => `<circle cx="16" cy="30" r="9" fill="${c}"/><circle cx="32" cy="30" r="9" fill="${c}"/><circle cx="24" cy="18" r="9" fill="${c}"/><g fill="#fff" opacity=".3"><ellipse cx="13" cy="27" rx="2" ry="3"/><ellipse cx="29" cy="27" rx="2" ry="3"/><ellipse cx="21" cy="15" rx="2" ry="3"/></g>`;
const lunchbox = (c: string, lid: string) => `<rect x="5" y="18" width="38" height="24" rx="6" fill="${c}"/><rect x="5" y="12" width="38" height="9" rx="4" fill="${lid}"/><path d="M18 12V8h12v4" ${stk("none", "#8a94a8", 2.5)}/><path d="M24 24v12M14 24v12M34 24v12" stroke="#fff" stroke-width="2" opacity=".35"/>`;
const drinkBottle = (c: string, cap: string) => S.bottle(c, cap, "#fff", S.mark("wave", c), { tall: true });
const scoop = (c: string) => S.tub(c, "#2a2a2a", "#fff", S.mark("flame", c));
const stickFood = (c: string, tip: string) => `<rect x="21" y="4" width="6" height="40" rx="3" fill="#e9c89a"/><ellipse cx="24" cy="16" rx="11" ry="12" fill="${c}"/><ellipse cx="20" cy="12" rx="3" ry="4" fill="#fff" opacity=".3"/><circle cx="24" cy="26" r="2.5" fill="${tip}"/>`;
const mug = (c: string) => `<path d="M8 14h28v16c0 7-5 12-14 12S8 37 8 30z" fill="${c}"/><path d="M36 18h4a4 4 0 0 1 0 12h-5" ${stk("none", c, 3)}/><path d="M16 9c-2-3 2-3 0-6M24 9c-2-3 2-3 0-6" ${stk("none", "#c9d0da", 2)}/><ellipse cx="22" cy="14" rx="14" ry="3" fill="#fff" opacity=".35"/>`;
const hairTie = (c: string) => `<circle cx="24" cy="24" r="14" fill="none" stroke="${c}" stroke-width="7"/><circle cx="24" cy="24" r="14" fill="none" stroke="#fff" stroke-width="2" stroke-dasharray="4 7" opacity=".5"/>`;
const mop = () => `<path d="M26 4L18 32" ${stk("none", "#a8b4c8", 3)}/><path d="M8 34h22l4 10H6z" fill="#f7d23e"/><path d="M12 34v10M18 34v10M24 34v10M30 34v10" stroke="#e0a526" stroke-width="1.6"/>`;
const broom = () => `<path d="M30 4L22 28" ${stk("none", "#a8b4c8", 3)}/><path d="M12 28h20l6 16H6z" fill="#c9a77a"/><path d="M12 28l-1 16M18 28l-1 16M24 28v16M30 28l1 16" stroke="#a8825a" stroke-width="1.6"/><rect x="10" y="26" width="24" height="5" rx="2" fill="#e2523f"/>`;
const plant = () => `<path d="M14 30h20l-3 12H17z" fill="#c2603a"/><path d="M24 30V14M24 22c-6 0-10-4-10-10 6 0 10 4 10 10zM24 18c6 0 10-4 10-10-6 0-10 4-10 10z" ${stk("#4cae52", "#3a8a3a", 1.5)}/>`;
const bone = (c = "#d9c39a") => `<path d="M10 16a5 5 0 1 1 7 7l14 14a5 5 0 1 1 7 7 5 5 0 0 1-7-1L17 28a5 5 0 0 1-7-12z" fill="${c}" stroke="#d9c9a8" stroke-width="1.5" transform="translate(0 -4) rotate(-12 24 24)"/>`;
const sock = () => `<path d="M14 6h14v20l12 8c3 2 2 8-2 8H22c-5 0-8-4-8-9z" fill="#7ab8f5"/><rect x="14" y="6" width="14" height="6" fill="#fff" opacity=".7"/>`;
const bucket = (c: string) => `<path d="M8 16h32l-4 26H12z" fill="${c}"/><path d="M8 16c0-8 32-8 32 0" ${stk("none", "#a8b4c8", 2.5)}/><ellipse cx="24" cy="16" rx="16" ry="4" fill="#fff" opacity=".35"/>`;

export const MORE: Row[] = [
  // ---------- more fruit and veg ----------
  ["papaya", "Papaya", "#fdebd2", "papaya,pawpaw", S.mango("#f59a4a")],
  ["dragonfruit", "Dragon fruit", "#fde0ec", "dragon fruit,dragonfruit,pitaya", S.round("#e5487f", { leaf: "#4cae52", dark: "#a8243f" })],
  ["lychee", "Lychee", "#fde8ea", "lychee,lychees,rambutan,longan,mangosteen", S.round("#e2665a", { leaf: false, stem: false })],
  ["rhubarb", "Rhubarb", "#fde0e4", "rhubarb", S.stalks("#d83a4f", "#4cae52", 3)],
  ["artichoke", "Artichoke", "#e4efd8", "artichoke,artichokes,globe artichoke", S.cabbage("#8fb86a", "#5a8a3a")],
  ["okra", "Okra", "#e6f2d4", "okra,ladies fingers,bhindi", S.chilli("#6fbf5a")],
  ["snowpeas", "Snow peas", "#e4f5d8", "snow peas,mange tout,sugar peas,edamame,broad beans,fava beans", S.pod("#6fbf5a")],
  ["beansprouts", "Bean sprouts", "#f1f5e0", "bean sprouts,beansprouts,sprouts alfalfa,alfalfa,micro herbs,microgreens,sprouted beans", S.stalks("#f4f1dc", "#e8d84a", 5)],
  ["jicama", "Daikon", "#f3f0f6", "daikon,white radish,jicama,kohlrabi,celeriac,horseradish,wasabi,wasabi paste", S.root("#d6cfe4", "#7bc65a")],
  ["yam", "Taro", "#eee4e0", "taro,yam,cassava,sweet taro,plantain,green banana", S.potato("#b8907a")],
  ["shiitake", "Shiitake", "#efe4d8", "shiitake,enoki,oyster mushrooms,king oyster,swiss brown,mushroom mix,dried mushrooms,porcini", S.mushroom("#8a5a3a")],
  ["pumpkinhalf", "Butternut", "#fdeacf", "butternut squash,spaghetti squash,acorn squash,kent pumpkin,pumpkin pieces,cut pumpkin", S.pumpkin("#e8a24a")],
  ["tomatoes2", "Truss tomatoes", "#fde3df", "vine tomatoes,truss,heirloom tomatoes,tomato vine,sun dried tomatoes,sundried tomatoes", S.blob("#d83a2f")],
  ["lemonjuice", "Lemon juice", "#fdf6c9", "lemon juice,lime juice,juice of lemon,bottled lemon,lemon squeezy", S.bottle(YEL, GRN, "#fff8d0", S.mark("drop", "#e0a526"), { wide: true })],
  ["zest", "Citrus", "#fdf3d0", "citrus,lemons and limes,limes and lemons,orange zest", S.citrus("#f2d83e", "#fbe88a")],
  ["watercress", "Salad greens", "#dff2d4", "salad greens,baby leaf,baby leaves,mesclun,witlof,endive,radicchio,mizuna,iceberg lettuce", S.lettuce("#a8d86a", "#6fbf5a")],
  ["potatoes2", "Baby potatoes", "#f5ecdc", "baby potatoes,chat potatoes,kipfler,new potatoes,red potatoes,pink eye,nicola", S.blob("#d9b46a")],
  ["pickledveg", "Pickled veg", "#f3e8dc", "pickled veg,pickled vegetables,giardiniera,pickled cabbage,pickled red onion,relish,chutney,piccalilli,beetroot relish", S.jar("#c98a3a", "#7a4a2a", "#fff3dc", S.mark("leaf", "#8a5a33"))],
  // ---------- meat and fish, more ----------
  ["duck", "Duck", "#fdeed8", "duck,duck breast,duck legs,goose,quail,pheasant", S.wholeChicken("#c9783a")],
  ["liver", "Liver", "#f5dad4", "liver,chicken liver,offal,kidney,tripe,ox tail,oxtail,bone marrow,marrow bones,beef bones,soup bones", S.ham("#a8483f")],
  ["patties", "Burger patties", "#fde3d6", "burger patties,patties,hamburger patties,beef patties,burger pattie,veggie burgers,plant based burgers,rissoles", patty("#a8482f")],
  ["meatballs", "Meatballs", "#fde5d4", "meatballs,meat balls,frikadeller,koftas,kofta,albondigas", balls("#a8582f")],
  ["roastbeef", "Roast", "#fde3d8", "roast,roast beef,beef roast,silverside,corned beef,brisket,topside,rolled roast,pot roast,slow cooker roast,leg of lamb", S.ham("#b8483a")],
  ["deliChicken", "Deli chicken", "#fdeadb", "chicken slices,sliced chicken,deli chicken,turkey slices,chicken loaf,devon,fritz,luncheon meat,spam,corned meat", S.salami("#d9965a")],
  ["tofu", "Tofu", "#f6f3e4", "tofu,firm tofu,silken tofu,tempeh,seitan,soy mince,veggie mince,plant based mince,quorn,vegetarian sausages,meat free", S.cheeseBlock("#f4efdc")],
  ["anchovies", "Sardines", "#e4eefa", "sardine,sardines,anchovy,herring,pilchards,whitebait,smelt,small fish,smoked fish,kippers,smoked trout,rollmops,sushi grade", S.fish("#8aa4c8", "#6a86a8")],
  ["sushi", "Sushi", "#fde8e4", "sushi,sushi rolls,sashimi,nigiri,california roll,hand roll,sushi pack", `<rect x="4" y="22" width="40" height="18" rx="8" fill="#f6f3ea"/><ellipse cx="14" cy="22" rx="8" ry="4" fill="#f4a58a"/><ellipse cx="34" cy="22" rx="8" ry="4" fill="#4cae52"/><rect x="4" y="30" width="40" height="5" fill="#2a2a2a" opacity=".85"/>`],
  ["nori", "Nori", "#e4e8e4", "nori,seaweed,sushi nori,seaweed snacks,wakame,kombu,dried seaweed,seaweed sheets,nori sheets", sheet("#2f3a30")],
  ["riceWrap", "Rice paper", "#f6f3ea", "rice paper,rice paper rolls,wonton wrappers,gow gee wrappers,dumpling wrappers,spring roll wrappers,spring roll pastry,wonton,gyoza wrappers", S.flat("#f6f1e0", "#d9d0b4")],
  // ---------- Asian and Mexican cupboard ----------
  ["currypaste", "Curry paste", "#fde0d8", "curry paste,red curry paste,green curry paste,thai curry paste,laksa paste,massaman,rendang,tom yum,panang,yellow curry paste,korma paste,vindaloo,madras paste", S.jar("#d83a2f", "#2a2a2a", "#fff3dc", S.mark("flame", "#d83a2f"))],
  ["sesame", "Sesame oil", "#f3e6d4", "sesame oil,toasted sesame oil,chilli sesame,rice bran,walnut oil,flaxseed oil,truffle oil,macadamia oil,infused oil,nut oil", S.bottle("#a8582f", "#2a2a2a", "#fde8cf", S.mark("sun", "#a8582f"), { tall: true })],
  ["fishsauce", "Fish sauce", "#f3e0d0", "fish sauce thai,nam pla,shrimp paste,xo sauce,black bean sauce,plum sauce,duck sauce,satay sauce,peanut sauce,sweet soy,bbq sauce char siu,char siu", S.bottle("#8a3a1a", RED, "#fde8cf", S.mark("wave", "#8a3a1a"), { wide: true })],
  ["ricewine", "Cooking wine", "#f6ecdc", "rice wine,shaoxing,cooking sherry,sake,marsala,mirin cooking,white wine vinegar,red wine for cooking,brandy for cooking", S.bottle("#e8c27a", "#7a4a2a", "#fff3dc", S.mark("drop", "#c98a1a"), { tall: true })],
  ["refried", "Refried beans", "#f3e4d8", "refried beans,black bean dip,mexican beans,chilli beans,enchilada kit,burrito sauce,taco sauce,taco shells hard,tostadas,tortilla bowl", S.tin("#8a3a2a", "#fde8cf", S.mark("bean", "#8a3a2a"))],
  ["salsa", "Salsa", "#fde3df", "salsa jar,tomato salsa,chunky salsa,pico de gallo,jalapeno salsa,mild salsa,hot salsa,queso,cheese sauce", S.jar("#e2523f", GRN, "#fff3dc", S.mark("flame", "#e2523f"))],
  ["tortillachips", "Corn chips", "#fdf3c4", "corn chips,tortilla chips,nacho chips,nacho cheese,doritos corn,taco chips,mission chips", S.bag("#f2a23e", W, S.mark("flame", RED), "#d9701a")],
  ["coconutoil", "Coconut oil", "#f3efe4", "coconut oil jar,coconut butter,ghee jar,lard,dripping,shortening,copha,cooking fat", S.jar("#fff8e6", "#4cae52", "#f6f3d4", S.mark("leaf", "#4cae52"))],
  ["tahini", "Tahini", "#f6ecd8", "tahini jar,halva,halvah,sesame paste,date syrup,pomegranate molasses,molasses jar,rose syrup", S.jar("#d9b46a", "#7a4a2a", "#fff", S.mark("circle", "#b8903a"))],
  ["rice2", "Rice cooker rice", "#f6f3ea", "rice flour,glutinous rice,sushi rice bag,jasmine rice bag,paella rice,rice paper bag,carnaroli,black rice,red rice", S.sack("#f6f1e0", "#e4dcc0", S.mark("leaf", "#9a8a5a"))],
  ["pastaShapes", "Pasta shapes", "#fdf0c8", "orecchiette,pappardelle,orzo,macaroni cheese,mac and cheese,cannelloni,tortelloni,ravioli packet,egg pasta,gluten free pasta,wholemeal pasta,spiral pasta,bow pasta,lasagna", S.pouch("#e8a62a", "#fff3c4", S.mark("star", "#c98a1a"))],
  ["gnocchi", "Gnocchi", "#fdf3d8", "gnocchi packet,potato gnocchi,fresh pasta,fresh ravioli,fresh gnocchi,fresh pasta sheets", S.tray("#f4e2b8")],
  ["instantMash", "Mashed potato", "#f6efdc", "instant mash,mashed potato,potato flakes,mash,potato mix,instant potato,gravy mix,roasting mix", S.box("#c9a06a", "#fff", S.mark("leaf", "#8a6a3a"))],
  // ---------- baking, more ----------
  ["bakemix", "Baking mix", "#fdf0d8", "baking mix,pancake mix,muffin mix,scone mix,pizza dough mix,bread mix,self raising mix,cake mix packet,flour mix,damper mix,waffle mix", S.box("#f59a2b", "#fff", S.mark("sun", ORG))],
  ["chocchips", "Choc chips", "#efe0d4", "choc bits,chocolate melts,candy melts,cooking chocolate bits,white chocolate chips,dark choc chips,m&ms,smarties,minstrels", S.pouch("#7a4a2a", "#fff3dc", S.mark("circle", BRN))],
  ["marshmallow", "Marshmallows", "#fde4ec", "marshmallows,marshmallow,fairy floss,candy floss,toffee,caramel,fudge,nougat,turkish delight,licorice allsorts", S.pouch("#f8c8d8", W, S.mark("heart", PNK))],
  ["caramel", "Caramel", "#fdebd0", "caramel sauce,dulce de leche,caramel topping,chocolate sauce,chocolate topping,strawberry topping,ice cream topping,sauce squeeze,maple flavoured syrup", S.sauceSquirt("#c98a3a", "#fff", "#fde8cf", S.mark("drop", "#c98a3a"))],
  ["almondmeal", "Almond meal", "#f6e8d4", "almond meal,almond flour,ground almonds,hazelnut meal,gluten free flour,spelt flour,rye flour,rice flour,besan,chickpea flour,coconut flour packet,wholemeal plain flour", S.sack("#e8c9a0", W, S.mark("heart", "#a8825a"))],
  // ---------- deli and fridge, more ----------
  ["dips", "Hummus", "#f6ecd8", "hummus tub,beetroot dip,baba ganoush,guacamole tub,spinach dip,pesto dip,dip tub,cheese spread,smoked salmon dip,onion jam", S.tub("#e8c27a", "#c98a3a", W, S.mark("circle", "#b8903a"))],
  ["kefir", "Kefir", "#eef2f8", "kefir,drinking yoghurt,lassi,probiotic yoghurt,buttermilk,ayran,skyr,quark,kids yoghurt tubes,yoghurt pouches,squeeze yoghurt", S.carton("#fff", "#9ec2f0", S.mark("heart", BLU), "#3a82e0")],
  ["eggsFree", "Egg whites", "#fdf3e0", "egg whites,liquid egg,egg yolks,egg substitute,egg replacer,pasteurised eggs,eggs in a carton", S.carton("#fdf3e0", "#f1d3a8", S.mark("circle", "#e0a526"), "#e0a526")],
  ["chocmilk", "Chocolate milk", "#efe0d4", "choc milk,flavoured milks,milo milk,breaki,moove,big m,ice coffee,strawberry milk,banana milk,milkshakes,dare", S.carton("#7a4a2a", "#e8c27a", S.mark("drop", W), "#e2523f")],
  ["cheese2", "Sliced cheese", "#fdf3d0", "sliced cheese,cheese singles,burger cheese,cheese slices pack,kraft singles,processed cheese,tasty slices,cheese wedges,laughing cow,cheese triangles", S.cheese("#f7a24a", "#e0701a")],
  ["blueCheese", "Blue cheese", "#eef2f8", "blue vein,stilton,danish blue,roquefort,gruyere,emmental,manchego,provolone,smoked cheese,cheddar vintage,aged cheddar", S.cheese("#f4efdc", "#7a9ac2")],
  // ---------- lunchbox and kids ----------
  ["lunchbox", "Lunchbox", "#e4effb", "lunchbox,lunch box,school lunch,sandwiches,bento,snack box,kids lunch,lunch kit,lunchables", lunchbox("#7ab8f5", "#3a82e0")],
  ["fruitpouch", "Fruit pouch", "#fde0ea", "fruit pouch,apple puree pouch,fruit puree,fruit squeeze,kids fruit,fruit straps,fruit leather,fruit sticks,fruit bar,sunny boys,smoothie pouch", S.pouch(PNK, "#fde8f0", S.mark("heart", PNK))],
  ["waterbottle", "Drink bottle", "#e4effb", "drink bottle,water bottle,reusable bottle,sipper,keep cup,thermos,flask,lunch drink,kids drink,juice popper", drinkBottle("#7ab8f5", BLU)],
  ["strawbs", "Yoghurt tubes", "#fde4ec", "yoghurt tubes,gogurt,yoplait,petit miam,chobani,activia,yopro,danone,dairy snacks,mini yoghurts", S.tub("#f8a8c0", "#e5487f", W, S.mark("star", "#e5487f"))],
  ["jellycup", "Jelly cups", "#fde0e4", "jelly cups,fruit jelly,pudding cups,custard cups,dessert cups,chocolate pudding,trifle,flan,creme caramel,gelato tub", S.tub("#e5487f", "#fff", "#fde8f0", S.mark("circle", PNK))],
  ["pizzaslice", "Pizza", "#fde8cf", "pizza pack,pizza dough ball,takeaway pizza,pizza slice,frozen pizza slice,pizza rolls,pizza scrolls,pizza kit,garlic pizza", `<path d="M24 42L6 12c11-7 25-7 36 0z" fill="#f7c844" stroke="#e0a526" stroke-width="2" stroke-linejoin="round"/><circle cx="19" cy="19" r="3.500" fill="#e2523f"/><circle cx="29" cy="21" r="3.500" fill="#e2523f"/>`],
  // ---------- drinks, more ----------
  ["coffeepods", "Coffee pods", "#efe0d4", "coffee pods tin,pods,k cups,instant coffee sachets,coffee sticks,coffee bags,cold drip,coffee concentrate,espresso beans,barista,flat white,latte mix,cappuccino mix,mocha mix,iced coffee mix", S.tin("#5a3418", "#e8c27a", S.mark("bean", "#5a3418"))],
  ["hotchoc", "Hot chocolate", "#efe0d4", "hot choc,hot chocolate powder,chai latte,chai powder,drinking chocolate tin,malted milk,horlicks,ovaltine,cocoa tin,milo tin", mug("#a8582f")],
  ["herbaltea", "Herbal tea", "#e4efd8", "herbal tea box,peppermint,chamomile box,fruit tea,rooibos,ginger tea,lemon tea,green tea box,tea box,detox tea,sleepy tea,throat tea,camomile", S.box("#6fbf5a", "#f4f7e4", S.mark("leaf", "#3a8a3a"))],
  ["proteinpowder", "Protein powder", "#f3ecdc", "protein powder,whey,creatine,pre workout,collagen,meal replacement,shake powder,vegan protein,electrolyte powder,hydralyte,gastrolyte", scoop("#8a94a8")],
  ["sparklingwine", "Champagne", "#fdf6d4", "bubbly,cava,mimosa,champers,sparkling rose,sparkling red,sparkling shiraz,moet,veuve", S.bottle("#3f6a3a", "#f7c844", "#fff8d0", S.mark("star", "#b8903a"), { tall: true })],
  ["cider", "Cider", "#fdf3c4", "apple cider,pear cider,cider bottle,somersby,strongbow,hard seltzer,vodka soda,premix,rtd,pre mix,mixed drinks,cocktail mix,margarita mix", S.can("#7bc65a", W, S.mark("bubbles", GRN))],
  ["cola", "Cola", "#f3e0d4", "diet coke,coke zero,pepsi max,zero sugar,diet cola,mountain dew,cherry coke,root beer,dr pepper,coca-cola,coca cola cans,cola cans,soft drink cans,soft drink bottle,soft drink 2l", S.bottle("#3a1a14", RED, RED, S.mark("wave", W), { wide: true })],
  ["lemonade", "Lemonade", "#fdf6c9", "lemonade 2l,sprite zero,sparkling lemonade,lemon squash,lemon lime bitters,l&p,lemon lime,7up,schweppes lemonade,creaming soda bottle,cream soda", S.bottle("#d6ec7a", "#4cae52", W, S.mark("bubbles", GRN), { wide: true })],
  // ---------- snacks, more ----------
  ["nutbar", "Nut bar", "#f3e8d4", "nut bar,nut bars,carob bar,date bar,oat bar,bliss balls,energy balls,protein balls,health bar,nut cluster,nut mix bar,seed bar", S.bar("#a8825a")],
  ["jerky", "Jerky", "#f5dad4", "jerky,beef jerky,biltong,meat snacks,meat sticks,kabana sticks,pork crackle,pork rinds,salami sticks,snack sticks", S.pouch("#8a3a2a", "#fde8cf", S.mark("flame", "#8a3a2a"))],
  ["wasabipeas", "Rice crackers", "#fdf0d8", "rice crackers asian,wasabi peas,nori crackers,prawn crackers,seaweed crisps,rice crackers packet,bhuja,bombay mix,chex mix,trail mix bag,japanese snacks,pocky,hello panda,pretzel sticks", S.bag("#e8c27a", W, S.mark("star", "#8a5a33"), "#c98a3a")],
  ["fruitbar", "Dried mango", "#fdebd2", "dried mango,dried banana,banana chips,apple chips,fruit chips,dried apple,freeze dried fruit,fruit crisps,yoghurt coated,coated nuts,dried berries,goji,mulberries,dried figs,dried apricot", S.pouch("#f59a2b", "#fff3dc", S.mark("sun", ORG))],
  ["gum", "Chewing gum", "#e0f2f7", "chewing gum,mints box,tic tacs,mentos,breath mints,lozenge,cough drops,eclipse,extra gum,wrigleys,peppermints,throat sweets,humbugs", S.pack("#7ad0c4", W, S.mark("star", TEAL))],
  // ---------- household, more ----------
  ["mop", "Mop", "#fdf3c4", "mop,mop refill,mop head,floor cleaner,floor wash,floor polish,floor mop,steam mop,swiffer,sweeper,floor wipes,dust pad", mop()],
  ["broom", "Broom", "#f3e8d4", "broom,dustpan,dustpan and brush,brush and pan,rubbish bin,wheelie bin,vacuum,vacuum bags,vacuum filter,stick vacuum,feather duster,duster,dusting spray,pledge", broom()],
  ["bucket", "Bucket", "#e4effb", "bucket,laundry basket,washing basket,peg,pegs,clothes pegs,clothesline,ironing board,hangers,coat hangers,drying rack", bucket(BLU)],
  ["houseplant", "Plant food", "#e4f5d8", "plant food,potting mix,fertiliser,fertilizer,seeds packet,seedlings,pot plant,mulch,compost,garden gloves,weed killer,pest spray,snail bait,lawn seed,seedling punnet", plant()],
  ["lightbattery", "Torch", "#fdf6d0", "torch batteries,led torch,head torch,lantern,power board,extension cord,power adapter,usb cable,phone charger,charging cable,adaptor,light globe,downlight,led strip,smoke alarm battery,remote battery", S.bulb()],
  ["stationery", "Stationery", "#e4effb", "pens,pencils,pencil,markers,textas,crayons,glue stick,scissors,notebook,exercise book,printer paper,envelopes,stamps,sticky tape,sellotape,ruler,eraser,highlighter,school supplies,folder,stapler,post it,sticky notes", `<rect x="8" y="22" width="32" height="8" rx="2" fill="#f7d23e" transform="rotate(-35 24 26)"/><path d="M34 12l4 4-6 3z" fill="#e2523f"/><rect x="6" y="30" width="34" height="8" rx="2" fill="#3a82e0" transform="rotate(-8 23 34)"/>`],
  ["hairties", "Hair ties", "#f3e4f2", "hair ties,hair clips,hair brush,bobby pins,scrunchies,headband,hair elastics,hair accessories,hairbrush,brush hair,shower cap,hair dryer,hair straightener,curlers", hairTie("#b86ab0")],
  ["nailpolish", "Nail polish", "#fde4ec", "nail polish,nail polish remover,acetone,nail file,nail clippers,tweezers,cotton pads nail,manicure,pedicure,nail varnish,false nails", S.bottle(PNK, "#2a2a2a", "#fde8f0", S.mark("drop", PNK), { tall: true })],
  ["contacts", "Contact lens", "#e4effb", "contact lenses,contact solution,eye drops,saline,glasses cleaner,lens cleaner,reading glasses,eye care,hay fever drops,nasal spray,saline spray,ear drops", S.bottle("#bfd8f0", BLU, W, S.mark("drop", BLU), { clear: true })],
  ["socks", "Socks", "#e4effb", "socks,sock,stockings,underwear,undies,singlets,school socks,beanie,t-shirt,pyjamas,pajamas", sock()],
  ["pettoy", "Dog chew", "#f6e4d4", "dog toy,dog chew,chew toy,dog bone,dog bowl,dog lead,dog collar,poo bags,pet bed,dog shampoo,dog treat,kong,tennis balls,pet toy,pet bowl", bone()],
  ["fishfood", "Fish food", "#e0f2f7", "fish flakes,fish tank,aquarium,water conditioner,fish tank filter,tropical fish,goldfish food,pond,turtle food,bird cage,bird seed bag,budgie,parrot food,hamster,guinea pig food,rabbit hay,reptile", S.pouch(TEAL, W, S.mark("bubbles", TEAL))],
  ["gift", "Gifts", "#fde4ec", "gifts,presents,wrapping paper,gift wrap,gift bag,birthday card,balloons,party hats,party bags,streamers,candles birthday,gift card,sellotape gift", `<rect x="8" y="20" width="32" height="22" rx="3" fill="#e5487f"/><rect x="6" y="14" width="36" height="9" rx="3" fill="#f06a9a"/><rect x="21" y="14" width="6" height="28" fill="#f7d23e"/><path d="M24 14c-6-8-12-6-9-2 2 2 6 2 9 2zM24 14c6-8 12-6 9-2-2 2-6 2-9 2z" fill="#f7d23e"/>`],
];
