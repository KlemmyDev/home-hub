/* Cupboard staples: flour, rice and pasta, tins, sauces, spreads, spices, baking, tea and coffee. */
import * as S from "./pantryshapes";
import type { Row } from "./pantrydata1";

const W = "#fff", BLU = "#3a82e0", RED = "#e2523f", GRN = "#4cae52", YEL = "#f7d23e", BRN = "#7a4a2a", ORG = "#f08a24", PUR = "#7b5cf0";

export const STAPLES: Row[] = [
  // ---------- flour, sugar, salt ----------
  ["flour", "Flour", "#f6f1e4", "flour,plain flour,all purpose flour,wholemeal flour,bread flour,flour 1kg", S.sack("#f6efe0", W, S.mark("leaf", "#c9a77a"))],
  ["srflour", "Self-raising flour", "#f6f1e4", "self raising flour,self-raising flour,sr flour,cake flour,corn flour,cornflour,cornstarch,arrowroot,almond meal,coconut flour", S.sack("#f6efe0", "#fde0d4", S.mark("star", RED))],
  ["sugar", "Sugar", "#f1f4f9", "sugar,white sugar,caster sugar,castor sugar,raw sugar,coconut sugar,sugar 1kg", S.sack("#fff", "#e4effb", S.mark("star", BLU))],
  ["brownsugar", "Brown sugar", "#f3e6d4", "brown sugar,dark brown sugar,muscovado,palm sugar", S.sack("#c98a5a", "#fff3dc", S.mark("star", BRN))],
  ["icingsugar", "Icing sugar", "#f8e8f0", "icing sugar,powdered sugar,confectioners sugar", S.sack("#fff", "#fbd8e6", S.mark("heart", "#e5487f"))],
  ["salt", "Salt", "#eef1f6", "salt,sea salt,table salt,rock salt,flaky salt,salt flakes,himalayan salt,cooking salt", S.shaker("#fff", "#cfd5e0", S.mark("circle", "#8a94a8"))],
  ["pepper", "Pepper", "#ececec", "pepper,black pepper,ground pepper,peppercorns,white pepper,cracked pepper", S.shaker("#3a3f4a", "#7a8499", S.mark("circle", W))],
  // ---------- rice, pasta, grains ----------
  ["rice", "Rice", "#f6f3ea", "rice,white rice,jasmine rice,long grain rice,arborio,risotto rice,rice 1kg,sushi rice,sticky rice", S.bag("#f6efe0", "#fff", S.mark("leaf", "#9a8a5a"), "#e6dcc0")],
  ["basmati", "Basmati rice", "#f5eed8", "basmati,basmati rice,brown rice,wild rice,microwave rice,rice pouch,rice cups", S.bag("#e8d9a8", "#fff", S.mark("star", "#b8903a"), "#d8c88a")],
  ["pasta", "Pasta", "#fdf0c8", "pasta,dried pasta,penne,fusilli,macaroni,spirals,rigatoni,farfalle,shells,pasta shapes,lasagne sheets,tortellini,gnocchi", S.pouch("#f2c23e", "#fff", S.mark("wave", "#e0a526"))],
  ["spaghetti", "Spaghetti", "#fdf0c8", "spaghetti,linguine,fettuccine,tagliatelle,angel hair,capellini", S.box("#e8a62a", "#fff3c4", S.mark("wave", "#c98a1a"))],
  ["noodles", "Noodles", "#fdf0d0", "noodles,egg noodles,instant noodles,rice noodles,udon,soba,vermicelli,two minute noodles,2 minute noodles,ramen noodles,maggi", S.pack("#f2a23a", "#fff3c4", S.mark("wave", RED))],
  ["couscous", "Couscous", "#fdf3d0", "couscous,cous cous,bulgur,burghul,polenta,semolina,pearl barley,barley,freekeh", S.pouch("#e8c27a", "#fff", S.mark("circle", "#c98a3a"))],
  ["quinoa", "Quinoa", "#f6efe0", "quinoa,chia seeds,chia,buckwheat,millet,amaranth,flaxseed,flax,linseed", S.pouch("#c98a5a", "#fff3dc", S.mark("leaf", "#8a5a33"))],
  ["oats", "Oats", "#f6efe0", "oats,rolled oats,porridge,quick oats,porridge oats,instant oats,oatmeal", S.tub("#e8c27a", "#c2463a", "#fff", S.mark("leaf", "#c98a3a"))],
  ["cereal", "Cereal", "#fde8cf", "cereal,cornflakes,corn flakes,weetbix,weet-bix,cheerios,coco pops,rice bubbles,special k,froot loops,nutri-grain,breakfast cereal,vita brits", S.box("#f59a2b", "#fff3c4", S.mark("sun", ORG), "#e2523f")],
  ["muesli", "Muesli", "#f3e8d4", "muesli,granola,museli,bircher,toasted muesli", S.pouch("#b8793a", "#fff3dc", S.mark("leaf", "#8a5a33"))],
  // ---------- oils, vinegar, sauces ----------
  ["oliveoil", "Olive oil", "#e8f2d0", "olive oil,extra virgin olive oil,evoo,oil,cooking oil", S.bottle("#8aa32a", "#3a4a1a", "#f6f3d4", S.mark("leaf", "#6a8a1a"), { tall: true })],
  ["vegoil", "Vegetable oil", "#fdf3c4", "vegetable oil,canola oil,sunflower oil,coconut oil,sesame oil,peanut oil,rice bran oil,cooking spray,avocado oil,olive oil spray", S.bottle("#f2c23e", "#e2523f", W, S.mark("drop", "#e0a526"), { tall: true, clear: true })],
  ["vinegar", "Vinegar", "#f3e6d8", "vinegar,white vinegar,red wine vinegar,balsamic,balsamic vinegar,apple cider vinegar,cider vinegar,rice vinegar,malt vinegar", S.bottle("#7a3a2a", "#2a2a2a", "#f6efe0", S.mark("drop", "#7a3a2a"))],
  ["soysauce", "Soy sauce", "#ece4de", "soy sauce,tamari,kecap manis,teriyaki,teriyaki sauce,soy,hoisin,hoisin sauce,oyster sauce,fish sauce,mirin,miso,miso paste", S.bottle("#2a1a14", RED, "#f6efe0", S.mark("wave", "#2a1a14"))],
  ["ketchup", "Tomato sauce", "#fde3df", "tomato sauce,ketchup,tomato ketchup", S.sauceSquirt(RED, "#fff", "#fff", S.mark("drop", RED))],
  ["bbqsauce", "BBQ sauce", "#f3e0d4", "bbq sauce,barbecue sauce,smoky bbq,steak sauce,worcestershire,worcestershire sauce,brown sauce,hp sauce", S.sauceSquirt("#7a2a1a", "#2a2a2a", "#fde8cf", S.mark("flame", "#c2463a"))],
  ["mayo", "Mayonnaise", "#fdf6dc", "mayo,mayonnaise,aioli,whole egg mayo,salad dressing,dressing,ranch,caesar dressing,thousand island", S.jar("#fbf3d4", "#e2523f", "#fff", S.mark("drop", "#e0a526"))],
  ["mustard", "Mustard", "#fdf3c4", "mustard,dijon,dijon mustard,wholegrain mustard,american mustard,english mustard", S.sauceSquirt("#f2c23e", "#e2523f", "#fff", S.mark("circle", "#c98a1a"))],
  ["hotsauce", "Hot sauce", "#fde0d8", "hot sauce,tabasco,sriracha,chilli sauce,sweet chilli,sweet chilli sauce,sambal,harissa,chilli oil,chilli paste,gochujang", S.bottle("#d83a2f", "#2a2a2a", "#fff3dc", S.mark("flame", "#d83a2f"))],
  ["pesto", "Pesto", "#e0f2d4", "pesto,basil pesto,green pesto,red pesto,tapenade,chimichurri", S.jar("#4cae52", "#e8c27a", "#fff", S.mark("leaf", "#3a8a3a"))],
  ["pastasauce", "Pasta sauce", "#fde3df", "pasta sauce,bolognese sauce,napoli,simmer sauce,cooking sauce,curry paste,curry sauce,butter chicken sauce,stir fry sauce,korma,tikka,pizza sauce,sauce", S.jar("#d8402f", "#fff", "#fff3dc", S.mark("drop", "#d8402f"))],
  ["tomatopaste", "Tomato paste", "#fde0d8", "tomato paste,tomato puree,concentrated tomato", S.tube("#d8402f", "#fff", S.mark("drop", W))],
  ["passata", "Passata", "#fde3df", "passata,tomato passata,sugo,crushed tomatoes in a bottle", S.bottle("#c2332f", "#2f7a3a", "#fff", S.mark("drop", "#c2332f"), { wide: true })],
  ["tinnedtomatoes", "Tinned tomatoes", "#fde3df", "tinned tomatoes,canned tomatoes,diced tomatoes,crushed tomatoes,chopped tomatoes,whole peeled tomatoes", S.tin("#c2332f", "#fff3dc", S.mark("drop", "#c2332f"))],
  // ---------- tins, jars, legumes ----------
  ["beans", "Baked beans", "#fdebd2", "baked beans,beans in tomato sauce,spaghetti tin,tinned spaghetti,heinz beans", S.tin("#c2463a", "#fde8cf", S.mark("bean", "#8a3a1a"))],
  ["kidneybeans", "Kidney beans", "#f5dfdc", "kidney beans,black beans,red kidney beans,cannellini,cannellini beans,butter beans,borlotti,mixed beans,haricot,beans tin", S.tin("#8a2a3a", "#fff", S.mark("bean", "#8a2a3a"))],
  ["chickpeas", "Chickpeas", "#fbf0d4", "chickpeas,chick peas,garbanzo,hummus,falafel", S.tin("#c98a3a", "#fff3dc", S.mark("circle", "#c98a3a"))],
  ["lentils", "Lentils", "#f6e6d4", "lentils,red lentils,green lentils,brown lentils,split peas,dried beans,dried peas,dal,dhal", S.pouch("#c2603a", "#fff", S.mark("circle", "#c2603a"))],
  ["tinnedtuna", "Tinned tuna", "#e4eefa", "tinned tuna,tuna tin,canned tuna,tuna,sardines tin,salmon tin,tinned fish,anchovies,john west,sirena", S.tin(BLU, "#fff", S.mark("wave", BLU))],
  ["coconutmilk", "Coconut milk", "#f3efe4", "coconut milk,coconut cream,coconut water,evaporated milk,condensed milk,sweetened condensed milk,tinned milk", S.tin("#fff", "#4cae52", S.mark("leaf", "#fff"), "#cfd5e0")],
  ["tinnedveg", "Tinned veg", "#e4f2d8", "tinned corn,canned corn,tinned peas,tinned beetroot,tinned veg,creamed corn,tinned mushrooms,artichokes,baby corn,water chestnuts,bamboo shoots", S.tin("#4cae52", "#f6f3d4", S.mark("leaf", "#3a8a3a"))],
  ["tinnedfruit", "Tinned fruit", "#fdf0c8", "tinned fruit,canned fruit,tinned peaches,tinned pineapple,fruit cups,fruit salad,tinned pears,apple sauce,applesauce,apple puree", S.tin("#f59a2b", "#fff3c4", S.mark("sun", "#f59a2b"))],
  ["soup", "Soup", "#fde8d4", "soup,tinned soup,canned soup,cup a soup,instant soup,chicken soup,tomato soup,pumpkin soup", S.tin("#c2463a", "#fff", S.mark("heart", "#c2463a"))],
  ["stock", "Stock", "#f6e8d4", "stock,chicken stock,beef stock,vegetable stock,stock cubes,stock powder,bouillon,massel,gravy powder,gravy", S.box("#c98a3a", "#fff3dc", S.mark("flame", "#c98a3a"))],
  ["olives", "Olives", "#eef2dc", "olives,green olives,black olives,kalamata,stuffed olives,pickled onions,gherkins,pickles,pickle,capers,sauerkraut,kimchi,pickled ginger,jalapenos jar", S.jar("#7a8a3a", "#4a5a1a", "#fff", S.mark("circle", "#7a8a3a"))],
  ["taco", "Taco kit", "#fde8cf", "taco kit,taco shells,taco seasoning,fajita kit,nachos,corn chips,salsa,tortilla chips,burrito kit,enchilada sauce,guacamole", S.box("#f08a24", "#fff3c4", S.mark("flame", RED))],
  // ---------- spreads, sweet ----------
  ["honey", "Honey", "#fdf0c8", "honey,manuka honey,golden syrup,maple syrup,syrup,agave,molasses,treacle,honey squeeze", S.honeyDip()],
  ["jam", "Jam", "#fde0e4", "jam,strawberry jam,raspberry jam,apricot jam,marmalade,fruit spread,conserve,lemon curd,berry jam", S.jar("#c2243f", "#fff", "#fff", S.mark("heart", "#c2243f"))],
  ["peanutbutter", "Peanut butter", "#f6e4d0", "peanut butter,almond butter,nut butter,tahini,sunflower butter,cashew butter,crunchy peanut butter", S.jar("#c98a5a", "#e2523f", "#fff", S.mark("bean", "#8a5a33"))],
  ["nutella", "Chocolate spread", "#efe0d4", "nutella,chocolate spread,hazelnut spread,choc spread,biscoff,cookie butter", S.nutella()],
  ["vegemite", "Vegemite", "#ece0d8", "vegemite,marmite,promite,yeast spread,bovril", S.jar("#2a1a14", "#e2523f", "#f7d23e", S.mark("star", "#2a1a14"))],
  ["chocolate", "Cooking chocolate", "#efe0d4", "chocolate,cooking chocolate,dark chocolate,choc chips,chocolate chips,cocoa,cocoa powder,baking chocolate,milk chocolate,white chocolate,carob,hot chocolate,milo,nesquik,drinking chocolate", S.chocBar()],
  ["sprinkles", "Sprinkles", "#fde4ec", "sprinkles,hundreds and thousands,cake decorations,food colouring,food coloring,icing,frosting,fondant,edible glitter,cake mix,brownie mix", S.shaker("#f8c8d8", "#e5487f", S.mark("star", "#e5487f"))],
  ["jelly", "Jelly", "#fde0e4", "jelly,jelly crystals,gelatine,gelatin,jello,agar", S.box("#e5487f", "#fff", S.mark("circle", "#e5487f"))],
  // ---------- baking ----------
  ["bakingpowder", "Baking powder", "#eef4fb", "baking powder,bicarb,bicarb soda,baking soda,bicarbonate,cream of tartar,yeast,dry yeast,instant yeast,sourdough starter,pectin", S.tin("#3a82e0", "#fff", S.mark("bubbles", BLU))],
  ["vanilla", "Vanilla", "#f6ecdc", "vanilla,vanilla essence,vanilla extract,vanilla bean,vanilla paste,almond essence,essence,extract,rosewater", S.bottle("#5a3418", "#2a1a0e", "#fff3dc", S.mark("star", "#8a5a33"))],
  ["breadcrumbs", "Breadcrumbs", "#fdf0d8", "breadcrumbs,panko,bread crumbs,crumb,stuffing,stuffing mix,coating mix,shake n bake,batter mix,tempura,tempura flour", S.pouch("#d99a4a", "#fff", S.mark("circle", "#c98a3a"))],
  ["desiccated", "Desiccated coconut", "#f3efe4", "desiccated coconut,shredded coconut,coconut flakes,coconut,coconut chips", S.pouch("#fff", "#4cae52", S.mark("leaf", W))],
  // ---------- spices ----------
  ["cinnamon", "Cinnamon", "#f3e0d0", "cinnamon,ground cinnamon,cinnamon sticks,mixed spice,allspice,nutmeg,cloves,ground ginger,cardamom,star anise,pumpkin spice,gingerbread spice", S.shaker("#a8582f", "#5a3418", S.mark("star", "#a8582f"))],
  ["paprika", "Paprika", "#fde3df", "paprika,smoked paprika,sweet paprika,cayenne,cayenne pepper,chilli powder,chilli flakes,dried chilli,chipotle,ancho,chilli,crushed chilli", S.shaker("#d8402f", "#2a2a2a", S.mark("flame", "#d8402f"))],
  ["cumin", "Cumin", "#f6e8d0", "cumin,ground cumin,coriander seeds,ground coriander,fennel seeds,caraway,cumin seeds,mustard seeds,fenugreek,nigella,spice,spices,seasoning", S.shaker("#c98a3a", "#5a3418", S.mark("sun", "#c98a3a"))],
  ["turmeric", "Turmeric", "#fdf0c0", "turmeric,saffron,ground turmeric,curry powder,garam masala,tandoori,tandoori paste,masala,ras el hanout,za'atar,zaatar,sumac,five spice,chinese five spice", S.shaker("#f2b632", "#7a4a2a", S.mark("sun", "#c98a1a"))],
  ["oregano", "Mixed herbs", "#e4efd8", "oregano,dried oregano,mixed herbs,dried herbs,italian herbs,dried basil,dried parsley,dried thyme,dried rosemary,bay leaves,bay leaf,herbs de provence,dried mint,dried dill,dried chives", S.shaker("#5a8a3a", "#2a4a1a", S.mark("leaf", "#5a8a3a"))],
  ["garlicpowder", "Garlic powder", "#f6f1e6", "garlic powder,onion powder,garlic salt,onion flakes,minced garlic,crushed garlic,garlic paste,ginger paste,lemon pepper,seasoning salt,msg,garlic granules,minced ginger", S.shaker("#f6efe0", "#c9a77a", S.mark("circle", "#c9a77a"))],
  // ---------- nuts, seeds ----------
  ["almonds", "Almonds", "#f6e8d4", "almonds,almond,flaked almonds,slivered almonds,hazelnuts,brazil nuts,macadamias,macadamia,pistachios,pecans", S.nutsBowl("#c98a5a")],
  ["cashews", "Cashews", "#fdf0d8", "cashews,cashew,peanuts,peanut,roasted peanuts,mixed nuts,trail mix,nuts,pine nuts,roasted nuts,salted nuts", S.nutsBowl("#e8c27a")],
  ["walnuts", "Walnuts", "#efe0d0", "walnuts,walnut,chestnuts,chestnut", S.nutsBowl("#8a5a33")],
  ["seeds", "Seeds", "#f3ecd8", "seeds,sunflower seeds,pumpkin seeds,pepitas,sesame seeds,poppy seeds,hemp seeds,sunflower kernels,nigella seeds", S.pouch("#9a8a4a", "#fff", S.mark("leaf", "#6a5a2a"))],
  // ---------- tea, coffee ----------
  ["tea", "Tea", "#f3e8d8", "tea,tea bags,teabags,black tea,green tea,earl grey,herbal tea,chamomile,peppermint tea,chai,english breakfast,iced tea,tea leaves,loose leaf tea,matcha", S.teaBag()],
  ["coffee", "Coffee", "#efe0d4", "coffee,ground coffee,coffee beans,instant coffee,coffee pods,nespresso,coffee capsules,espresso,nescafe,decaf,coffee grounds,plunger coffee", S.coffeeBeans()],
  ["creamer", "Coffee creamer", "#f3ece0", "coffee creamer,creamer,coffee sachets,3 in 1,sweetener,stevia,equal,splenda,sugar sachets,sugar cubes,coffee mate", S.box("#c9a77a", "#fff", S.mark("heart", "#8a5a33"))],
];
