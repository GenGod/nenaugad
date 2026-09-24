import { Unavailable } from "../../components/unavailable.tsx";
export default function Saved() {
  return <Unavailable title="Сохранённое — после авторизации"
    detail="В стартовом шаблоне ещё нет личного кабинета и серверного сохранения. Мы не показываем фиктивное «сохранено» и не храним ваши письма в общем браузерном кэше." />;
}
