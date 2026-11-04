// Synthetic builder input; not a filing-ready patent.
module.exports = {
  metadata: { file_label: "example_sensor_controller", invention_title: "센서 제어 장치" },
  invention_title: "센서 제어 장치",
  technical_field: "본 예시는 센서값에 따른 제어 장치에 관한 것이다.",
  background: ["센서값을 이용하여 구동부의 동작을 제어하는 시스템이 사용될 수 있다."],
  problem_to_solve: ["센서값과 기준값의 비교에 따라 밸브를 제어하는 장치를 제공한다."],
  solution: ["센서 제어 장치는 센서와 제어기를 포함한다. 제어기는 센서값이 기준값을 초과하면 밸브를 닫는다."],
  effects: ["센서값을 기준값과 비교하여 밸브의 닫힘 동작을 제어할 수 있다."],
  detailed_description: [
    {
      heading: "1. 구성과 동작", level: 3,
      paragraphs: [
        "센서(110)는 측정값을 제어기(120)에 제공한다.",
        "제어기(120)는 측정값을 기준값과 비교하고, 측정값이 기준값을 초과하면 밸브(130)를 닫도록 제어한다."
      ]
    },
    "일 예로, 기준값은 제어기(120)의 메모리에 저장될 수 있다."
  ],
  symbols: [
    { num: "110", name: "센서" }, { num: "120", name: "제어기" }, { num: "130", name: "밸브" }
  ],
  claims: [
    { num: 1, text: "센서; 및 상기 센서의 측정값이 기준값을 초과하면 밸브를 닫도록 제어하는 제어기를 포함하는 센서 제어 장치." },
    { num: 2, text: "제1항에 있어서, 상기 제어기는 상기 기준값을 저장하는 메모리를 포함하는 센서 제어 장치." }
  ],
  abstract: "센서 제어 장치는 센서와 제어기를 포함하고, 제어기는 센서값이 기준값을 초과하면 밸브를 닫도록 제어한다."
};
