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
};

export function getEncounterForAct(act, kind) {
  if (!Number.isInteger(act) || act < 1 || act > 3 || (kind !== 'npc' && kind !== 'boss')) return null;
  return ENCOUNTERS[kind + '-' + act];
}
