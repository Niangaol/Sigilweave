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
};

export function getEncounterForAct(act, kind) {
  if (!Number.isInteger(act) || act < 1 || act > 3 || (kind !== 'npc' && kind !== 'boss')) return null;
  return ENCOUNTERS[kind + '-' + act];
}

export function getEncounterById(id) {
  return typeof id === 'string' && Object.hasOwn(ENCOUNTERS, id) ? ENCOUNTERS[id] : null;
}

// 每幕的两个小 Boss 事件点定义（供地图事件系统取用）
export function getMinibossEncounters(act) {
  if (!Number.isInteger(act) || act < 1 || act > 3) return [];
  return [ENCOUNTERS['miniboss-' + act + '-a'], ENCOUNTERS['miniboss-' + act + '-b']];
}
