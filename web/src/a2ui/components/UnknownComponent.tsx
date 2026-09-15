export default function UnknownComponent({ name }: { name: string }) {
  return (
    <div className="bn-unknown" role="note">
      Componente no soportado: {name}
    </div>
  );
}
