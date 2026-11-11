// 所有答案均可从本次展示的线索直接推得；奖励由场景消费一次。
export const ENCOUNTERS = {
  'npc-1': {
    id: 'npc-1', type: 'npc', name: '艾琳', title: '灰烬祭坛的守灯人',
    clues: [
      { id: 'lamp', text: '守灯人：只有银叶灯油能点亮通往祭坛的白焰。' },
      { id: 'other', text: '石碑：松脂燃起红焰，鲸脂燃起蓝焰；它们都不能开启白焰之门。' },
    ],
    question: '要点亮开门的白焰，应交给艾琳哪种灯油？',
    choices: [{ id: 'silver', label: '银叶灯油' }, { id: 'pine', label: '松脂灯油' }, { id: 'whale', label: '鲸脂灯油' }],
    correctChoiceId: 'silver', explanation: '守灯人明确指出银叶灯油才能点亮开门的白焰。',
    successText: '白焰亮起。艾琳赠你 8 碎晶，并为你恢复 15 点生命。',
    failureText: '错色的火焰惊醒了灰烬，余烬令你迟缓 8 秒。',
    reward: { shards: 8, heal: 15 }, penalty: { slowMs: 8000 },
  },
  'npc-2': {
    id: 'npc-2', type: 'npc', name: '瑟维安', title: '潮声回廊的巡礼者',
    clues: [
      { id: 'order', text: '巡礼者：祭坛只接受依次敲响“贝壳、铜钟、石磬”的回声。' },
      { id: 'start', text: '你已听见贝壳的第一声回响，后两件器物尚未被敲响。' },
    ],
    question: '按祭坛的顺序，下一件应敲响什么？',
    choices: [{ id: 'shell', label: '再次敲贝壳' }, { id: 'bell', label: '敲铜钟' }, { id: 'stone', label: '敲石磬' }],
    correctChoiceId: 'bell', explanation: '顺序是贝壳、铜钟、石磬；贝壳之后应敲铜钟。',
    successText: '回声归位。瑟维安交给你 8 碎晶，并为你恢复 15 点生命。',
    failureText: '错乱的回声化作潮雾，令你迟缓 8 秒。',
    reward: { shards: 8, heal: 15 }, penalty: { slowMs: 8000 },
  },
  'npc-3': {
    id: 'npc-3', type: 'npc', name: '莉芙拉', title: '星陨圣所的织誓者',
    clues: [
      { id: 'seal', text: '织誓者：太阳纹封印热量，月亮纹封印声音，星辰纹封印记忆。' },
      { id: 'need', text: '圣所的祭坛遗失了记忆，必须取回封存记忆的那枚印记。' },
    ],
    question: '应将哪枚印记带回祭坛？',
    choices: [{ id: 'sun', label: '太阳纹印记' }, { id: 'moon', label: '月亮纹印记' }, { id: 'star', label: '星辰纹印记' }],
    correctChoiceId: 'star', explanation: '线索明确写明星辰纹封印记忆，而祭坛需要找回记忆。',
    successText: '星纹重现往昔。莉芙拉赠你 8 碎晶，并为你恢复 15 点生命。',
    failureText: '无主的记忆缠住脚步，令你迟缓 8 秒。',
    reward: { shards: 8, heal: 15 }, penalty: { slowMs: 8000 },
  },
  'boss-1': {
    id: 'boss-1', type: 'boss', bossId: 'boss-1', name: '烬冠骑士', title: '白焰祭坛的僭主',
    clues: [
      { id: 'name', text: '断剑铭文：烬冠骑士的真名为“奥瑟恩”；“赤王”与“焰父”只是他夺来的称号。' },
      { id: 'oath', text: '维生契约：在祭坛前呼出他的真名，即可解除维生誓约，让骑士当场化为灰烬。' },
    ],
    question: '呼出哪个名字能解除契约，直接消灭烬冠骑士？',
    choices: [{ id: 'red', label: '赤王' }, { id: 'true', label: '奥瑟恩' }, { id: 'flame', label: '焰父' }],
    correctChoiceId: 'true', explanation: '铭文给出的真名是奥瑟恩；契约明确规定呼出真名会解除维生誓约并当场消灭骑士。',
    successText: '“奥瑟恩！”真名撕开契约，烬冠骑士当场化灰，无需战斗。额外获得 4 碎晶。',
    failureText: '虚假的称号未能触及真名。烬冠骑士拔剑，正式战斗开始。',
    reward: { shards: 4 }, penalty: {},
  },
  'boss-2': {
    id: 'boss-2', type: 'boss', bossId: 'boss-2', name: '溺誓女爵', title: '沉钟祭坛的债主',
    clues: [
      { id: 'anchor', text: '契约残页：女爵的生命只系于铜钟内的蓝色誓绳；红绳与白绳均为诱饵。' },
      { id: 'break', text: '解除条款：割断那根维生誓绳，女爵即刻消散，不会进入战斗。' },
    ],
    question: '应割断哪根绳，才能解除维生契约并直接消灭女爵？',
    choices: [{ id: 'blue', label: '蓝色誓绳' }, { id: 'red', label: '红色誓绳' }, { id: 'white', label: '白色誓绳' }],
    correctChoiceId: 'blue', explanation: '残页指出只有蓝色誓绳维系生命；解除条款说明割断它会令女爵即刻消散。',
    successText: '蓝绳断裂，维生契约作废。溺誓女爵当场消散，无需战斗。额外获得 4 碎晶。',
    failureText: '诱饵化为潮水。女爵的维生契约仍在，正式战斗开始。',
    reward: { shards: 4 }, penalty: {},
  },
  'boss-3': {
    id: 'boss-3', type: 'boss', bossId: 'boss-3', name: '无昼织王', title: '终星祭坛的囚徒',
    clues: [
      { id: 'name', text: '星图：织王降生时的真名是“伊斯缇尔”，不是“长夜”或“空冠”。' },
      { id: 'release', text: '最后契约：将真名填入终止誓词，所有维生丝线将同时断裂，织王立即灭亡。' },
    ],
    question: '终止誓词应填入哪个真名，才能让织王立即灭亡？',
    choices: [{ id: 'night', label: '长夜' }, { id: 'crown', label: '空冠' }, { id: 'true', label: '伊斯缇尔' }],
    correctChoiceId: 'true', explanation: '星图公开的真名为伊斯缇尔；填入终止誓词即可断开全部维生丝线，直接消灭织王。',
    successText: '誓词落定，维生丝线尽断。无昼织王当场灭亡，无需战斗。额外获得 4 碎晶。',
    failureText: '空名无法终止契约。织王展开夜幕，正式战斗开始。',
    reward: { shards: 4 }, penalty: {},
  },

  // ---- 小 Boss 前置问答（事件点触发，答对处决 / 答错实战，不通幕） ----
  'miniboss-1a': {
    id: 'miniboss-1a', type: 'boss', tier: 'mini', name: '守墓傀儡·东', title: '墓园东门的石卫',
    bossId: 'miniboss-1a',
    clues: [
      { id: 'rune', text: '石卫胸口刻着：「奉上与我眼中同色的供物，卫兵让路。」' },
      { id: 'eye', text: '它的双眼镶着两枚绿石。' },
    ],
    question: '应奉上什么供物让石卫让路？',
    choices: [{ id: 'green', label: '绿石' }, { id: 'red', label: '红石' }, { id: 'bone', label: '兽骨' }],
    correctChoiceId: 'green', explanation: '石卫眼中镶绿石，同色供物即是它认的奉纳。',
    successText: '供物吻合，石卫单膝跪地让路，崩解为碎石，无需战斗。',
    failureText: '石卫眼中绿光爆闪，抡起了石拳！',
    reward: { shards: 6 }, penalty: {},
  },
  'miniboss-1b': {
    id: 'miniboss-1b', type: 'boss', tier: 'mini', name: '守墓傀儡·西', title: '墓园西门的石卫',
    bossId: 'miniboss-1b',
    clues: [
      { id: 'tally', text: '石卫手臂上刻着三道旧痕，旁边写着：「欠一还三。」' },
      { id: 'ask', text: '它摊开手掌，似乎在等足够的偿付。' },
    ],
    question: '它还在等几道痕的偿付？',
    choices: [{ id: 'one', label: '一道' }, { id: 'two', label: '两道' }, { id: 'three', label: '三道' }],
    correctChoiceId: 'three', explanation: '刻着三道旧痕且「欠一还三」，说明三道都未偿清。',
    successText: '旧账两讫，石卫散成一方方碎石，让出西门，无需战斗。',
    failureText: '偿付错了数目，石卫的 eye 孔亮起红光，挥拳砸来！',
    reward: { shards: 6 }, penalty: {},
  },
  'miniboss-2a': {
    id: 'miniboss-2a', type: 'boss', tier: 'mini', name: '腐沼巨尸·钟楼', title: '钟楼下的浮尸',
    bossId: 'miniboss-2a',
    clues: [
      { id: 'bell', text: '钟楼铜钟停在「差一刻」的位置，尸体的喉咙里卡着钟锤。' },
      { id: 'rule', text: '碑文：敲响正点，浮尸沉底；敲错点位，浮尸起身。' },
    ],
    question: '要让浮尸沉底，应把钟拨到哪个位置敲响？',
    choices: [{ id: 'quarter', label: '差一刻处' }, { id: 'full', label: '正点处' }, { id: 'half', label: '半点处' }],
    correctChoiceId: 'full', explanation: '碑文写明敲响正点浮尸才沉底，铜钟卡锤只是干扰描述。',
    successText: '正点钟声落下，浮尸缓缓沉入沼底，无需战斗。',
    failureText: '钟声错位，浮尸猛然从沼里立起！',
    reward: { shards: 6 }, penalty: {},
  },
  'miniboss-2b': {
    id: 'miniboss-2b', type: 'boss', tier: 'mini', name: '腐沼巨尸·祭池', title: '祭池里的沉棺',
    bossId: 'miniboss-2b',
    clues: [
      { id: 'coffin', text: '祭池中央的沉棺钉着七枚沼钉，已拔出三枚。' },
      { id: 'rule', text: '棺盖手书：钉尽则开，开棺者友。' },
    ],
    question: '还剩几枚沼钉需要拔出？',
    choices: [{ id: 'three', label: '三枚' }, { id: 'four', label: '四枚' }, { id: 'five', label: '五枚' }],
    correctChoiceId: 'four', explanation: '七枚钉已拔三枚，还剩四枚。',
    successText: '最后四枚沼钉弹落，沉棺浮起，尸身向你颔首后沉回，无需战斗。',
    failureText: '数目错了，沉棺里的东西抓住了池沿！',
    reward: { shards: 6 }, penalty: {},
  },
  'miniboss-3a': {
    id: 'miniboss-3a', type: 'boss', tier: 'mini', name: '裂瞳主教·东席', title: '王庭东席的独眼者',
    bossId: 'miniboss-3a',
    clues: [
      { id: 'eye', text: '主教的独眼流着星光，他说：「我的眼只认得倒影里的真名。」' },
      { id: 'note', text: '他递给你一面小镜。' },
    ],
    question: '要向主教证明身份，应呈上什么？',
    choices: [{ id: 'mirror', label: '举起小镜' }, { id: 'name', label: '报出自己的名字' }, { id: 'bow', label: '深深鞠躬' }],
    correctChoiceId: 'mirror', explanation: '他的眼只认倒影里的真名，镜子里的你即是证明。',
    successText: '镜中真名闪过，主教遮眼退入阴影，让出东席，无需战斗。',
    failureText: '独眼里的星光凝聚成刺，主教起身迎战！',
    reward: { shards: 6 }, penalty: {},
  },
  'miniboss-3b': {
    id: 'miniboss-3b', type: 'boss', tier: 'mini', name: '裂瞳主教·西席', title: '王庭西席的独眼者',
    bossId: 'miniboss-3b',
    clues: [
      { id: 'chain', text: '西席主教的双腕锁着断链，链上挂着三把钥匙，其中两把已经锈死。' },
      { id: 'want', text: '他说：「用能用的那把，开我脚下的枷。」' },
    ],
    question: '应使用哪把钥匙？',
    choices: [{ id: 'rusty', label: '任意一把锈死的' }, { id: 'good', label: '没锈的那把' }, { id: 'all', label: '三把一起用' }],
    correctChoiceId: 'good', explanation: '两把已锈死，能用的只有没锈的那把。',
    successText: '枷锁弹开，主教卸下断链，自行沉入暗影，无需战斗。',
    failureText: '锈钥匙应声而断，主教被激怒了！',
    reward: { shards: 6 }, penalty: {},
  },

  // ================= 北斗后半段：第四幕 天权 · 沉钟书库 =================
  'npc-4': {
    id: 'npc-4', type: 'npc', name: '梅薇', title: '沉钟书库的抄经人',
    clues: [
      { id: 'bell', text: '梅薇：书库的钟只在「第七页翻完」时敲响；钟声一落，所有书页都会自己合上。' },
      { id: 'mark', text: '书签：你手里的书签夹在第 4 页与第 5 页之间，从第 5 页到第 7 页还没翻。' },
    ],
    question: '还要翻几页，书库的钟才会敲响？',
    choices: [{ id: 'two', label: '两页' }, { id: 'three', label: '三页' }, { id: 'four', label: '四页' }],
    correctChoiceId: 'three', explanation: '书签停在 4、5 页之间，剩下第 5、6、7 三页；翻完第七页钟响。',
    successText: '钟声落定。梅薇把 8 枚碎晶塞进你手里，又替你抚平翻乱的书页，恢复 15 点生命。',
    failureText: '钟声提前惊动了书架，落灰呛得你脚步发沉 8 秒。',
    reward: { shards: 8, heal: 15 }, penalty: { slowMs: 8000 },
  },
  'boss-4': {
    id: 'boss-4', type: 'boss', bossId: 'boss-4', name: '万卷之喉·卡瑞恩', title: '沉钟书库的吞书者',
    clues: [
      { id: 'spine', text: '书脊铭文：万卷之喉吞下的第一本书是《终末索引》，它自己的真名也印在索引的最后一页。' },
      { id: 'last', text: '索引末页：最后一页只写着一个名字「卡瑞恩」，旁注：喉主的真名，念出即解约。' },
    ],
    question: '应向喉中念出哪个名字？',
    choices: [{ id: 'index', label: '终末索引' }, { id: 'true', label: '卡瑞恩' }, { id: 'throat', label: '万卷之喉' }],
    correctChoiceId: 'true', explanation: '铭文说真名印在索引末页，末页写的就是卡瑞恩；念出真名即解除契约。',
    successText: '「卡瑞恩！」喉中万卷齐吐，万卷之喉当场噎死，无需战斗。额外获得 4 碎晶。',
    failureText: '念错的名字被书页吞了回去。万卷之喉张开书口，正式战斗开始。',
    reward: { shards: 4 }, penalty: {},
  },
  'miniboss-4a': {
    id: 'miniboss-4a', type: 'boss', tier: 'mini', name: '缄默书吏·东', title: '借阅厅的东吏',
    bossId: 'miniboss-4a',
    clues: [
      { id: 'tag', text: '书吏胸前挂着借阅牌，牌上写：「还我未还的那本，我便让路。」' },
      { id: 'have', text: '你怀里只有一本借出未还的《灰烬索引》；《潮声祷本》《空白之书》都还在架上。' },
    ],
    question: '应把哪本书还给东吏？',
    choices: [{ id: 'ash', label: '灰烬索引' }, { id: 'tide', label: '潮声祷本' }, { id: 'blank', label: '空白之书' }],
    correctChoiceId: 'ash', explanation: '借阅牌只要「未还的那本」，你手上借出未还的正是《灰烬索引》。',
    successText: '书吏接过《灰烬索引》，在牌上划掉一行，退进书架阴影，无需战斗。',
    failureText: '递错的书被书吏合上，整排书架向前压来！',
    reward: { shards: 6 }, penalty: {},
  },
  'miniboss-4b': {
    id: 'miniboss-4b', type: 'boss', tier: 'mini', name: '缄默书吏·西', title: '断页厅的西吏',
    bossId: 'miniboss-4b',
    clues: [
      { id: 'cover', text: '西吏捧着一册残书，封皮写：「全书十二页，现存七页。」' },
      { id: 'slip', text: '书脊夹着一张工单：「缺页未补，不得出库。」' },
    ],
    question: '这册残书缺了几页？',
    choices: [{ id: 'three', label: '三页' }, { id: 'five', label: '五页' }, { id: 'seven', label: '七页' }],
    correctChoiceId: 'five', explanation: '全书 12 页现存 7 页，12 − 7 = 5，缺五页。',
    successText: '补页章落下，西吏把残书放回架上，侧身让路，无需战斗。',
    failureText: '数目对不上，西吏把残书砸在案上，纸页化作利刃！',
    reward: { shards: 6 }, penalty: {},
  },

  // ================= 第五幕 玉衡 · 衡律法庭 =================
  'npc-5': {
    id: 'npc-5', type: 'npc', name: '奥菲', title: '衡律法庭的书记官',
    clues: [
      { id: 'rule', text: '奥菲：法庭只认等价物。一枚契约钉折三枚碎晶，你欠的是两枚钉的罚。' },
      { id: 'copy', text: '判词抄本：欠几枚钉，就按每枚三枚碎晶折算，不设找零。' },
    ],
    question: '应缴多少碎晶才能平账？',
    choices: [{ id: 'three', label: '三枚' }, { id: 'six', label: '六枚' }, { id: 'nine', label: '九枚' }],
    correctChoiceId: 'six', explanation: '两枚钉，每枚折三枚碎晶：2 × 3 = 6。',
    successText: '天平归位。奥菲收下六枚碎晶，在判词上盖了「两讫」，并为你恢复 15 点生命。',
    failureText: '数目不对，法槌落下，回声震得你脚步发沉 8 秒。',
    reward: { shards: 8, heal: 15 }, penalty: { slowMs: 8000 },
  },
  'boss-5': {
    id: 'boss-5', type: 'boss', bossId: 'boss-5', name: '失衡法官·塞维鲁', title: '衡律法庭的断秤者',
    clues: [
      { id: 'verdict', text: '判词：法官的性命系在天平左盘的黑色砝码上；右盘空着，秤杆一直压到底。' },
      { id: 'page', text: '契约附页：取走左盘砝码，天平失衡，法官会随判词一起坠下。' },
    ],
    question: '怎样才能让法官当场坠下？',
    choices: [{ id: 'right', label: '往右盘加一枚砝码' }, { id: 'left', label: '取走左盘的黑色砝码' }, { id: 'gavel', label: '敲响法槌' }],
    correctChoiceId: 'left', explanation: '附页写明左盘砝码维系法官性命，取走即失衡坠落。',
    successText: '黑砝码离盘，天平轰然倾覆。失衡法官随判词坠下，无需战斗。额外获得 4 碎晶。',
    failureText: '天平纹丝不动。法官抬起断秤，正式开庭。',
    reward: { shards: 4 }, penalty: {},
  },
  'miniboss-5a': {
    id: 'miniboss-5a', type: 'boss', tier: 'mini', name: '铁面陪审·东', title: '东席的陪审',
    bossId: 'miniboss-5a',
    clues: [
      { id: 'mask', text: '面具刻字：「一票否决需三票赞成、两票反对。」' },
      { id: 'board', text: '记票板：现场已有两票赞成、一票反对。' },
    ],
    question: '还需要几票赞成，否决才能通过？',
    choices: [{ id: 'one', label: '一票' }, { id: 'two', label: '两票' }, { id: 'three', label: '三票' }],
    correctChoiceId: 'one', explanation: '规则要三票赞成，已有两票，还差一票。',
    successText: '第三票落下，陪审团齐齐起身让路，无需战斗。',
    failureText: '票数不够，铁面陪审把票箱扣在你头上！',
    reward: { shards: 6 }, penalty: {},
  },
  'miniboss-5b': {
    id: 'miniboss-5b', type: 'boss', tier: 'mini', name: '铁面陪审·西', title: '西席的陪审',
    bossId: 'miniboss-5b',
    clues: [
      { id: 'scale', text: '西席守着一杆断秤，秤杆刻到「五五」就断了，他说：「补到十，秤就平。」' },
      { id: 'pan', text: '秤盘上现在压着四。' },
    ],
    question: '还要往秤盘上补几，秤才平？',
    choices: [{ id: 'four', label: '四' }, { id: 'five', label: '五' }, { id: 'six', label: '六' }],
    correctChoiceId: 'six', explanation: '补到十，盘上已有四，还差 10 − 4 = 6。',
    successText: '秤杆接上，指针归零，西席收秤让路，无需战斗。',
    failureText: '秤盘一沉，断秤弹起，西席抄起了秤砣！',
    reward: { shards: 6 }, penalty: {},
  },

  // ================= 第六幕 开阳 · 熔星锻炉 =================
  'npc-6': {
    id: 'npc-6', type: 'npc', name: '铎恩', title: '熔星锻炉的铸星者',
    clues: [
      { id: 'fire', text: '铎恩：炉火分青、白、赤三色；只有白色炉火能把星铁锻成能用的胚。' },
      { id: 'log', text: '炉志：青火淬骨，赤火熔渣，二者都会让星铁炸裂。' },
    ],
    question: '应取哪一色炉火来锻星铁？',
    choices: [{ id: 'cyan', label: '青色炉火' }, { id: 'white', label: '白色炉火' }, { id: 'red', label: '赤色炉火' }],
    correctChoiceId: 'white', explanation: '炉志写明青、赤都会炸裂星铁，只有白火可用。',
    successText: '白火舔过铁胚，星铁发出清鸣。铎恩递来 8 枚碎晶，并为你补了 15 点生命。',
    failureText: '错色的火苗窜出炉口，燎得你脚步发沉 8 秒。',
    reward: { shards: 8, heal: 15 }, penalty: { slowMs: 8000 },
  },
  'boss-6': {
    id: 'boss-6', type: 'boss', bossId: 'boss-6', name: '熔心匠主·布洛姆', title: '熔星锻炉的守炉人',
    clues: [
      { id: 'core', text: '匠主胸口的熔心用三根铆钉固定，铭文：「三钉尽拔，熔心熄，匠主成铁。」' },
      { id: 'order', text: '工单：三根铆钉必须按「上、左、右」的顺序拔；顺序错了，熔心会先炸。' },
    ],
    question: '第一根该拔哪一根铆钉？',
    choices: [{ id: 'top', label: '上钉' }, { id: 'left', label: '左钉' }, { id: 'right', label: '右钉' }],
    correctChoiceId: 'top', explanation: '工单规定顺序是上、左、右，第一根就是上钉。',
    successText: '上、左、右三钉依序落地，熔心熄灭。匠主凝成一尊铁像，无需战斗。额外获得 4 碎晶。',
    failureText: '顺序错了，熔心轰然炸开。匠主抡起铁锤，正式战斗开始。',
    reward: { shards: 4 }, penalty: {},
  },
  'miniboss-6a': {
    id: 'miniboss-6a', type: 'boss', tier: 'mini', name: '淬火傀儡·左', title: '淬火池的守池傀',
    bossId: 'miniboss-6a',
    clues: [
      { id: 'board', text: '池边木牌：「一桶水淬三件，今日已淬两件。」' },
      { id: 'bucket', text: '池里还浮着满满一桶水，桶沿刻着「余一」。' },
    ],
    question: '这桶水还能淬几件？',
    choices: [{ id: 'one', label: '一件' }, { id: 'two', label: '两件' }, { id: 'three', label: '三件' }],
    correctChoiceId: 'three', explanation: '一桶水固定淬三件；今日已淬的两件用的是上一桶，这一桶仍是满的。',
    successText: '傀儡沉回池底，让出淬火位，无需战斗。',
    failureText: '数字不对，傀儡从池里探出烧红的铁臂！',
    reward: { shards: 6 }, penalty: {},
  },
  'miniboss-6b': {
    id: 'miniboss-6b', type: 'boss', tier: 'mini', name: '淬火傀儡·右', title: '铁砧旁的守砧傀',
    bossId: 'miniboss-6b',
    clues: [
      { id: 'back', text: '巨像背上刻：「锤重九，臂力三，需三击同落。」' },
      { id: 'runes', text: '铭文：「三锤齐落，砧裂像倒。」' },
    ],
    question: '需要几锤同时落下，铁砧才会裂？',
    choices: [{ id: 'three', label: '三锤' }, { id: 'six', label: '六锤' }, { id: 'nine', label: '九锤' }],
    correctChoiceId: 'three', explanation: '铭文直接写明三锤齐落、砧裂像倒；锤重与臂力只是干扰描述。',
    successText: '三锤同落，铁砧裂成两半，巨像随之倾倒，无需战斗。',
    failureText: '锤数不对，巨像抡起整座铁砧砸下！',
    reward: { shards: 6 }, penalty: {},
  },

  // ================= 第七幕 摇光 · 破晓之座 =================
  'npc-7': {
    id: 'npc-7', type: 'npc', name: '黎恩', title: '破晓之座的守望者',
    clues: [
      { id: 'order', text: '黎恩：破晓之座只在「第七颗星落进王座」时开启；北斗七星的次序是天枢、天璇、天玑、天权、玉衡、开阳、摇光。' },
      { id: 'stele', text: '碑文：摇光是第七颗，也是最后一颗。' },
    ],
    question: '落进王座的应是第几颗星？',
    choices: [{ id: 'six', label: '第六颗' }, { id: 'seven', label: '第七颗' }, { id: 'one', label: '第一颗' }],
    correctChoiceId: 'seven', explanation: '碑文与守望者都指明摇光是第七颗、也是最后一颗。',
    successText: '第七颗星落座，王座亮起。黎恩把 8 枚碎晶放在你掌心，并为你恢复 15 点生命。',
    failureText: '错位的星光刺进王座，整座高台都在发抖，你脚步发沉 8 秒。',
    reward: { shards: 8, heal: 15 }, penalty: { slowMs: 8000 },
  },
  'boss-7': {
    id: 'boss-7', type: 'boss', bossId: 'boss-7', name: '破晓之王·厄俄斯', title: '破晓之座的最后契约主',
    clues: [
      { id: 'crown', text: '王座铭文：厄俄斯的王冠由七枚星屑镶成，缺一枚则冠碎人亡。' },
      { id: 'chart', text: '星图残卷：七枚星屑里唯一不属于北斗的是「借来的第八枚」，它一直藏在冠底。' },
    ],
    question: '应取走哪一枚星屑？',
    choices: [{ id: 'top', label: '冠顶的第一枚' }, { id: 'eighth', label: '冠底的第八枚' }, { id: 'any', label: '任意一枚' }],
    correctChoiceId: 'eighth', explanation: '残卷写明冠底藏着不属于北斗的第八枚；取走它王冠就缺一枚。',
    successText: '第八枚星屑离冠，王冠碎成星尘。破晓之王在晨光里散尽，无需战斗。额外获得 4 碎晶。',
    failureText: '星冠纹丝不动。厄俄斯睁开晨眼，正式战斗开始。',
    reward: { shards: 4 }, penalty: {},
  },
  'miniboss-7a': {
    id: 'miniboss-7a', type: 'boss', tier: 'mini', name: '残星骑士·左', title: '星桥的断誓骑士',
    bossId: 'miniboss-7a',
    clues: [
      { id: 'shield', text: '骑士的盾上钉着七枚星钉，已经掉落两枚；他说：「七星归位，我便让路。」' },
      { id: 'bridge', text: '桥头刻着：「七钉齐全，桥才过。」' },
    ],
    question: '还需要归位几枚星钉？',
    choices: [{ id: 'five', label: '五枚' }, { id: 'seven', label: '七枚' }, { id: 'two', label: '两枚' }],
    correctChoiceId: 'five', explanation: '七枚星钉掉了两枚，还差 7 − 2 = 5 枚。',
    successText: '五枚星钉归位，骑士收盾退到桥边，无需战斗。',
    failureText: '盾面星钉齐齐弹出，骑士策马冲来！',
    reward: { shards: 6 }, penalty: {},
  },
  'miniboss-7b': {
    id: 'miniboss-7b', type: 'boss', tier: 'mini', name: '残星骑士·右', title: '晓色门前的点灯侍从',
    bossId: 'miniboss-7b',
    clues: [
      { id: 'lamps', text: '侍从捧着七盏灯，只点亮了天枢、天璇、天玑三盏；他说：「点满七盏，门就开。」' },
      { id: 'seat', text: '灯座上刻着七颗星名，亮着的三盏已被描金。' },
    ],
    question: '还要点亮几盏灯？',
    choices: [{ id: 'three', label: '三盏' }, { id: 'four', label: '四盏' }, { id: 'seven', label: '七盏' }],
    correctChoiceId: 'four', explanation: '七盏已亮三盏，还差 7 − 3 = 4 盏。',
    successText: '四盏灯次第亮起，晓色门开启，侍从躬身让路，无需战斗。',
    failureText: '灯油泼翻，火舌卷上你的衣角！',
    reward: { shards: 6 }, penalty: {},
  },
};

export function getEncounterForAct(act, kind) {
  if (!Number.isInteger(act) || act < 1 || act > 7 || (kind !== 'npc' && kind !== 'boss')) return null;
  return ENCOUNTERS[kind + '-' + act];
}

export function getEncounterById(id) {
  return typeof id === 'string' && Object.hasOwn(ENCOUNTERS, id) ? ENCOUNTERS[id] : null;
}

// 每幕的两个小 Boss 事件点定义（供地图事件系统取用）
export function getMinibossEncounters(act) {
  if (!Number.isInteger(act) || act < 1 || act > 7) return [];
  return [ENCOUNTERS['miniboss-' + act + '-a'], ENCOUNTERS['miniboss-' + act + '-b']];
}
