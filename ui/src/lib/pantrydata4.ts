/* Drinks, snacks, cleaning, paper goods, bathroom, baby, pets and the odds and ends of the house. */
import * as S from "./pantryshapes";
import type { Row } from "./pantrydata1";

const pawSm = (c: string) => `<g transform="translate(12.5 17) scale(.48)">${S.paw(c)}</g>`;
const W = "#fff", BLU = "#3a82e0", RED = "#e2523f", GRN = "#4cae52", YEL = "#f7d23e", ORG = "#f08a24", PUR = "#7b5cf0", PNK = "#e5487f", TEAL = "#0ea5b7";

export const HOUSE: Row[] = [
  // ---------- drinks ----------
  ["water", "Water", "#e4f2fb", "water,bottled water,spring water,mineral water,water bottles,still water,water 24 pack,water pack", S.bottle("#cfe9fa", BLU, W, S.mark("drop", BLU), { clear: true })],
  ["sparkling", "Sparkling water", "#e0f2f7", "sparkling water,soda water,mineral water sparkling,tonic,tonic water,seltzer,club soda,sparkling mineral,san pellegrino,perrier,ginger beer,ginger ale", S.bottle("#bfe6ef", TEAL, W, S.mark("bubbles", TEAL), { clear: true })],
  ["juice", "Juice", "#fde8cf", "juice,orange juice,fruit juice,apple juice,pineapple juice,cranberry juice,tomato juice,prune juice,juice box,juice boxes,popper,poppers,grape juice", S.carton("#f59a2b", W, S.mark("sun", ORG), "#3fa66b")],
  ["cordial", "Cordial", "#fde0ea", "cordial,squash,raspberry cordial,lemon cordial,lime cordial,flavoured syrup,milkshake syrup,cordial syrup", S.bottle("#e5487f", "#fff", "#fde8f0", S.mark("drop", PNK), { tall: true })],
  ["softdrink", "Soft drink", "#fde3df", "soft drink,cola,coke,coca cola,pepsi,fanta,sprite,lemonade,soda,lemonade bottle,mixers,schweppes,solo,creaming soda,dr pepper,fizzy drink,cans", S.can(RED, W, S.mark("wave", RED))],
  ["energy", "Energy drink", "#e8f5d4", "energy drink,red bull,v energy,monster,mother,sports drink,gatorade,powerade,electrolytes,protein shake,protein drink", S.can("#3a4a8a", "#7bc65a", S.mark("flame", "#3a4a8a"))],
  ["kombucha", "Kombucha", "#f3ecdc", "kombucha,iced coffee,iced tea bottle,cold brew,flavoured milk,chocolate milk,milkshake,smoothie,smoothies,yakult,probiotic drink,coconut water", S.bottle("#c98a3a", "#2a2a2a", "#fff3dc", S.mark("bubbles", "#c98a3a"), { wide: true })],
  ["beer", "Beer", "#fdf0d0", "beer,beers,lager,ale,pale ale,craft beer,stubbies,cider,cider cans,xxxx,carlton,vb,corona,heineken,stout,ipa", S.beerGlass()],
  ["redwine", "Red wine", "#f2dce2", "red wine,shiraz,merlot,cabernet,pinot noir,malbec,wine,port,sherry,rose", S.wineGlass("#a8243f")],
  ["whitewine", "White wine", "#fdf6d4", "white wine,chardonnay,sauvignon blanc,riesling,pinot grigio,champagne,prosecco,sparkling wine,moscato,semillon", S.wineGlass("#f2d86a")],
  ["spirits", "Spirits", "#efe0d4", "spirits,vodka,gin,whisky,whiskey,rum,tequila,bourbon,brandy,scotch,liqueur,baileys,bitters,cooking wine,mixer", S.bottle("#7a4a2a", "#2a2a2a", "#fde8cf", S.mark("star", "#7a4a2a"), { wide: true })],
  // ---------- snacks ----------
  ["chips", "Chips", "#fdf3c4", "chips,potato chips,crisps,smiths,doritos,twisties,cheezels,pringles,kettle chips,corn chips snack,shapes,chicken crimpy,snack bag", S.bag("#f2c23e", W, S.mark("star", RED), "#e0a526")],
  ["popcorn", "Popcorn", "#fdf3d8", "popcorn,microwave popcorn,popping corn,kernels", S.popcorn()],
  ["crackers", "Crackers", "#fdf0d8", "crackers,rice crackers,cracker,jatz,saos,water crackers,cruskits,rice cakes,corn thins,crispbread,ryvita,vita-weat,pretzels,pretzel", S.cracker()],
  ["chocbar", "Chocolate bar", "#efe0d4", "chocolate bar,choc bar,block of chocolate,cadbury,mars bar,snickers,kitkat,kit kat,twix,freddo,lindt,tim tam,easter eggs,chocolate block", S.chocBar()],
  ["lollies", "Lollies", "#fde4ec", "lollies,lolly,sweets,candy,jelly beans,gummies,gummy bears,jelly babies,liquorice,licorice,fruit tingles,mints,musk sticks,chewing gum,gum", S.lolly()],
  ["museliBar", "Muesli bars", "#f3e8d4", "muesli bars,muesli bar,snack bars,protein bar,protein bars,fruit bars,cereal bars,granola bars,roll ups,fruit snacks,nutri grain bar,kids snacks,snacks", S.bar("#b8793a")],
  ["cheesesticks", "Cheese snacks", "#fdf3c8", "cheese sticks,babybel,cheese snacks,cheese and crackers,dips,dip,onion dip,french onion dip,tzatziki,cheese dip,hummus dip", S.tub("#f7c844", "#e2523f", W, S.mark("circle", "#e0a526"))],
  ["bickies", "Biscuits", "#fdf0d8", "biscuits packet,shortbread,anzac,anzac biscuits,digestive,milk arrowroot,granita,iced vovo,monte carlo,scotch finger,wafers,wafer", S.cookie("#e0a85a")],
  // ---------- paper and wraps ----------
  ["toiletpaper", "Toilet paper", "#eef2f8", "toilet paper,toilet roll,toilet rolls,loo roll,bog roll,tp", S.roll_paper()],
  ["papertowel", "Paper towel", "#eef2f8", "paper towel,paper towels,kitchen towel,kitchen roll,kitchen paper,napkins,serviettes,paper napkins,paper plates,paper cups,party supplies", S.roll_paper("#e8f0fb")],
  ["tissues", "Tissues", "#eef2f8", "tissues,tissue,kleenex,facial tissues,tissue box", S.box("#7ab8f5", W, S.mark("wave", "#7ab8f5"))],
  ["bin", "Bin bags", "#e8ecf2", "bin bags,rubbish bags,garbage bags,bin liners,trash bags,kitchen tidy bags,nappy bags,dog poo bags", S.sack("#3a4256", "#cfd5e0", S.mark("circle", "#3a4256"))],
  ["clingwrap", "Cling wrap", "#eef4fb", "cling wrap,glad wrap,cling film,plastic wrap,food wrap,beeswax wrap", S.box("#bfd8f0", W, S.mark("wave", BLU))],
  ["foil", "Foil", "#eceff4", "foil,aluminium foil,alfoil,tin foil,baking foil,oven bags", S.box("#cfd5e0", "#8a94a8", S.mark("star", "#5a6478"))],
  ["bakingpaper", "Baking paper", "#f3ece0", "baking paper,baking parchment,parchment,greaseproof paper,cupcake cases,patty pans,cake tin liners,silicone mat", S.box("#e8dcc0", W, S.mark("wave", "#b8a070"))],
  ["zipbags", "Zip bags", "#e6f2f7", "zip bags,zip lock bags,ziplock,sandwich bags,snap lock,freezer bags,lunch bags,snap lock bags,glad bags,reusable bags", S.pouch("#cfe9fa", W, S.mark("stripe", BLU))],
  // ---------- cleaning ----------
  ["dishliquid", "Dish liquid", "#e0f4f2", "dishwashing liquid,dish soap,dish liquid,dishwashing detergent,morning fresh,palmolive,svia,dish detergent,washing up liquid", S.sauceSquirt(TEAL, "#fff", "#e0f7f4", S.mark("bubbles", TEAL))],
  ["dishtabs", "Dishwasher tablets", "#e4effb", "dishwasher tablets,dishwasher tabs,dishwasher powder,finish,dishwasher salt,rinse aid,dishwasher pods,dishwashing tablets,dishwasher", S.box(BLU, W, S.mark("bubbles", BLU))],
  ["laundry", "Laundry liquid", "#e6e8fa", "laundry liquid,laundry detergent,washing powder,washing liquid,omo,fab,surf,laundry powder,laundry pods,napisan,stain remover,vanish,laundry,washing detergent", S.bottle(PUR, "#fff", "#e8e4fb", S.mark("bubbles", PUR), { wide: true })],
  ["softener", "Fabric softener", "#f3e4f2", "fabric softener,softener,comfort,downy,fabric conditioner,dryer sheets,laundry softener,ironing spray,linen spray", S.bottle("#b86ab0", "#fff", "#f8e4f6", S.mark("heart", "#b86ab0"), { wide: true })],
  ["bleach", "Bleach", "#eef2fa", "bleach,white king,napisan bleach,toilet cleaner,toilet duck,harpic,drain cleaner,drano,disinfectant,pine o cleen,pinoclean,dettol,domestos,sorbent", S.bottle("#e8f0fa", "#2f7a3a", "#c9e8d4", S.mark("cross", "#2f7a3a"), { wide: true })],
  ["surfacespray", "Surface spray", "#e4f5f0", "surface spray,multipurpose spray,spray and wipe,windex,glass cleaner,window cleaner,bathroom cleaner,kitchen cleaner,cleaning spray,oven cleaner,mr muscle,cif,jif,all purpose cleaner,antibacterial spray,spray", S.spray("#7ad0c4", RED, W, S.mark("bubbles", TEAL))],
  ["sponges", "Sponges", "#fdf3c4", "sponges,sponge,scourers,scourer,scrubbers,scrub,dishcloths,cloths,microfibre,microfibre cloths,chux,wipes cloth,steel wool,brush,dish brush", S.sponge()],
  ["wipes", "Cleaning wipes", "#e4f5f0", "wipes,cleaning wipes,disinfecting wipes,antibacterial wipes,wet wipes,baby wipes,face wipes,makeup wipes", S.tub("#7ad0c4", W, "#e8f7f4", S.mark("drop", TEAL))],
  ["batteries", "Batteries", "#f6f1d8", "batteries,battery,aa batteries,aaa batteries,9v battery,button battery,duracell,energizer,rechargeable batteries", S.battery()],
  ["lightbulb", "Light bulbs", "#fdf6d0", "light bulb,light bulbs,globes,led globe,lightbulb,led bulbs,fairy lights,torch,fuse", S.bulb()],
  ["candles", "Candles", "#fdf3dc", "candles,candle,tea lights,tealights,birthday candles,air freshener,glade,scented candle,incense,room spray,reed diffuser", S.candle()],
  ["matches", "Matches", "#fde3df", "matches,lighter,lighters,firelighters,fire lighters,kindling,charcoal,heat beads,gas bottle,firewood,briquettes", S.matches()],
  // ---------- bathroom ----------
  ["handsoap", "Hand soap", "#e4effb", "hand soap,hand wash,soap,liquid soap,bar soap,soap bar,handwash,hand sanitiser,hand sanitizer,sanitiser", S.sauceSquirt(BLU, "#fff", "#e8f0fb", S.mark("bubbles", BLU))],
  ["bodywash", "Body wash", "#e4f5ea", "body wash,shower gel,bath gel,bubble bath,bath salts,body scrub,shower cream,bath bomb", S.bottle(GRN, "#fff", "#e4f7ea", S.mark("wave", GRN), { wide: true })],
  ["shampoo", "Shampoo", "#f3e4f2", "shampoo,hair shampoo,kids shampoo,dandruff shampoo,baby shampoo,dry shampoo", S.bottle("#e5487f", "#fff", "#fde8f0", S.mark("heart", PNK))],
  ["conditioner", "Conditioner", "#e4e8fa", "conditioner,hair conditioner,hair mask,hair oil,hair gel,hairspray,hair spray,hair wax,detangler,leave in conditioner,hair product", S.bottle("#6a7ae0", "#fff", "#e8ebfb", S.mark("drop", "#6a7ae0"))],
  ["toothpaste", "Toothpaste", "#e0f2fa", "toothpaste,tooth paste,kids toothpaste,mouthwash,mouth wash,floss,dental floss,listerine,colgate,oral b", S.tube("#3a82e0", "#fff", S.mark("star", W))],
  ["toothbrush", "Toothbrush", "#e0f2fa", "toothbrush,toothbrushes,tooth brush,electric toothbrush heads,interdental,dental", S.toothbrush()],
  ["deodorant", "Deodorant", "#e4effb", "deodorant,roll on,antiperspirant,body spray,perfume,cologne,aftershave,fragrance,lynx,rexona,dove deodorant", S.spray("#9ec9f0", "#fff", W, S.mark("wave", BLU))],
  ["razor", "Razors", "#e4effb", "razor,razors,shaving,shaving cream,shaving foam,shaving gel,disposable razors,razor blades,gillette,wax strips,hair removal,veet", S.razor()],
  ["sunscreen", "Sunscreen", "#fdf3c4", "sunscreen,sunblock,sun cream,spf,spf 50,sun screen,after sun,aloe vera,insect repellent,aeroguard,bug spray,mosquito", S.tube(YEL, ORG, S.mark("sun", ORG))],
  ["lotion", "Moisturiser", "#fde8ec", "moisturiser,moisturizer,body lotion,hand cream,face cream,lip balm,chapstick,vaseline,sorbolene,nivea,cetaphil,body butter,face wash,cleanser,serum,toner,makeup remover,makeup", S.tub("#f8c8d8", PNK, W, S.mark("heart", PNK))],
  ["tampons", "Period products", "#fde4ec", "tampons,pads,sanitary pads,panty liners,period products,sanitary,menstrual cup,period pads,liners", S.pack("#e5487f", "#fde8f0", S.mark("drop", PNK))],
  ["cottonbuds", "Cotton buds", "#eef2f8", "cotton buds,cotton tips,cotton balls,cotton pads,q tips,makeup pads,cotton wool,cotton", S.tub("#fff", "#7ab8f5", "#eaf3fb", S.mark("circle", "#9ec9f0"))],
  // ---------- baby and health ----------
  ["nappies", "Nappies", "#e4f0fa", "nappies,nappy,diapers,diaper,pull ups,pullups,huggies,babylove,baby nappies,swim nappies,nappy pants", S.nappy()],
  ["babyfood", "Baby food", "#fdf0d8", "baby food,baby formula,formula,baby cereal,pouches,baby pouch,baby snacks,rusks,teething,baby milk,infant formula,s26,aptamil", S.jar("#f2c23e", "#7ab8f5", W, S.mark("heart", "#e0a526"))],
  ["vitamins", "Vitamins", "#fde8d4", "vitamins,vitamin c,vitamin d,fish oil,multivitamin,supplements,probiotics,iron tablets,magnesium,zinc,cod liver oil,vitamin,omega 3,melatonin,gummy vitamins", S.shaker("#f59a2b", W, S.mark("sun", ORG))],
  ["painkillers", "Pain relief", "#fde3e0", "painkillers,panadol,paracetamol,ibuprofen,nurofen,aspirin,pain relief,cold and flu,throat lozenges,lozenges,antihistamine,hayfever,cough syrup,cold tablets,medicine,medication,tablets,panadol kids", S.pill()],
  ["bandaids", "Band-aids", "#fdebd8", "band aids,bandaids,band-aids,plasters,bandages,first aid,first aid kit,antiseptic,savlon,dettol antiseptic,gauze,sticking plasters,tape,thermometer", S.bandaid()],
  // ---------- pets ----------
  ["dogfood", "Dog food", "#f6e4d4", "dog food,dog biscuits,dog treats,puppy food,dry dog food,pal,dog chews,dog,bones,rawhide,schmackos,dentastix,wet dog food", S.sack("#a8582f", W, pawSm("#a8582f"))],
  ["catfood", "Cat food", "#f3e6f2", "cat food,cat biscuits,cat treats,kitten food,dry cat food,whiskas,fancy feast,cat,sheba,wet cat food,cat milk,temptations", S.sack("#7b5cf0", W, pawSm("#7b5cf0"))],
  ["catlitter", "Cat litter", "#eceff4", "cat litter,kitty litter,litter,litter tray,litter box,pet litter,wood pellets", S.sack("#8a94a8", "#e4e8f0", S.mark("circle", "#5a6478"))],
  ["petmisc", "Pet supplies", "#f3e8d4", "pet food,bird seed,fish food,hay,rabbit food,guinea pig,pet treats,flea,worming,flea treatment,pet shampoo,pet supplies,bird food", S.pouch("#c98a3a", W, pawSm("#c98a3a"))],
];
