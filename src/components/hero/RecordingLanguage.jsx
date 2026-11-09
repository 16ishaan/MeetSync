import languageCodes from "../../../shared/whisper-languages.json";

const names = new Intl.DisplayNames(["en"], { type: "language" });
const languages = languageCodes.map(code => ({
  code,
  name: names.of(code),
})).sort((a, b) => a.name.localeCompare(b.name, "en"));

export default function RecordingLanguage({ value, onChange, disabled }) {
  return (
    <label className="recording-language">
      Spoken language
      <select value={value} onChange={event => onChange(event.target.value)} disabled={disabled}>
        <option value="">Auto-detect</option>
        {languages.map(({ code, name }) => (
          <option key={code} value={code}>{name}</option>
        ))}
      </select>
    </label>
  );
}
