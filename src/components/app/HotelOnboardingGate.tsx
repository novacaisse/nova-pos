// Onboarding ZegHotel obligatoire (migration 082, mission "Onboarding +
// MoneyFusion + permissions", Partie 1) — constat de
// AUDIT_ZEGHOTEL_FINALISATION_2026-08.md (§3) : HotelSetupForm ne créait
// que l'identité de l'établissement, jamais de chambre. Ce composant
// s'intercale dans app.hotel.tsx, avant l'<Outlet/> qui donne accès à tout
// /app/hotel/*, tant que organizations.hotel_onboarding_completed est
// false. Un compte déjà équipé de chambres avant ce chantier est backfillé
// à true en base (migration 082) — jamais bloqué rétroactivement.
import { useState } from "react";
import { Loader2, BedDouble, Sparkle, Plus, Trash2, CheckCircle2 } from "lucide-react";
import { motion } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { useMyRole } from "@/lib/data/hooks";
import { useOrganization } from "@/lib/auth/OrganizationProvider";
import {
  useHotelRoomTypes, useUpsertHotelRoomType, useDeleteHotelRoomType,
  useHotelRooms, useUpsertHotelRoom, useDeleteHotelRoom,
} from "@/lib/data/hotelHooks";
import { selectOnFocus } from "@/lib/utils";

export function HotelOnboardingGate() {
  const { data: myRole, isLoading: roleLoading } = useMyRole();
  const { currentOrganization, refresh } = useOrganization();

  if (roleLoading || !currentOrganization) {
    return <div className="grid min-h-[60vh] place-items-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
  }

  const canSetup = myRole === "owner" || myRole === "manager";
  if (!canSetup) {
    return (
      <div className="grid min-h-[60vh] place-items-center px-5">
        <div className="w-full max-w-md rounded-2xl border border-dashed border-border bg-card p-8 text-center">
          <BedDouble className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
          <div className="font-display text-lg font-bold">Configuration en attente</div>
          <p className="mt-2 text-sm text-muted-foreground">
            Le propriétaire ou un manager doit d'abord créer au moins une chambre avant que ZegHotel soit utilisable. Contactez-le pour finaliser la configuration.
          </p>
        </div>
      </div>
    );
  }

  return <HotelSetupWizard organizationId={currentOrganization.id} onDone={refresh} />;
}

function HotelSetupWizard({ organizationId, onDone }: { organizationId: string; onDone: () => Promise<void> }) {
  const { data: roomTypes = [] } = useHotelRoomTypes();
  const upsertRoomType = useUpsertHotelRoomType();
  const deleteRoomType = useDeleteHotelRoomType();
  const { data: rooms = [] } = useHotelRooms();
  const upsertRoom = useUpsertHotelRoom();
  const deleteRoom = useDeleteHotelRoom();

  const [typeName, setTypeName] = useState("");
  const [typePrice, setTypePrice] = useState(0);
  const [roomNumber, setRoomNumber] = useState("");
  const [roomTypeId, setRoomTypeId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [finishing, setFinishing] = useState(false);

  const inp = "w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary";

  const addType = async () => {
    setError(null);
    try {
      if (!typeName.trim()) throw new Error("Le nom du type de chambre est requis.");
      const t = await upsertRoomType.mutateAsync({ name: typeName.trim(), base_price: typePrice });
      setTypeName(""); setTypePrice(0);
      setRoomTypeId(t.id);
    } catch (e: any) { setError(e?.message ?? "Erreur inconnue"); }
  };

  const addRoom = async () => {
    setError(null);
    try {
      if (!roomTypeId) throw new Error("Créez d'abord un type de chambre.");
      if (!roomNumber.trim()) throw new Error("Le numéro de chambre est requis.");
      await upsertRoom.mutateAsync({ number: roomNumber.trim(), room_type_id: roomTypeId });
      setRoomNumber("");
    } catch (e: any) { setError(e?.message ?? "Erreur inconnue"); }
  };

  const canFinish = roomTypes.length > 0 && rooms.length > 0;

  const finish = async () => {
    if (!canFinish) return;
    setError(null); setFinishing(true);
    try {
      const { error: updErr } = await supabase.from("organizations")
        .update({ hotel_onboarding_completed: true }).eq("id", organizationId);
      if (updErr) throw updErr;
      await onDone();
    } catch (e: any) {
      setError(e?.message ?? "Erreur inconnue");
      setFinishing(false);
    }
  };

  return (
    <div className="grid min-h-[80vh] place-items-center px-4 py-10">
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-2xl rounded-3xl border border-border bg-card p-7 shadow-elegant">
        <div className="mb-1 flex items-center gap-2">
          <BedDouble className="h-5 w-5 text-primary" />
          <h1 className="font-display text-2xl font-bold">Configurez vos chambres</h1>
        </div>
        <p className="mb-6 text-sm text-muted-foreground">
          Dernière étape avant d'utiliser ZegHotel : créez au moins un type de chambre et une chambre. Vous pourrez tout modifier ensuite dans « Chambres ».
        </p>

        <div className="mb-6 rounded-2xl border border-border p-4">
          <div className="mb-3 flex items-center gap-2 text-sm font-semibold"><Sparkle className="h-4 w-4 text-primary" /> 1. Types de chambre</div>
          <div className="mb-3 flex gap-2">
            <input value={typeName} onChange={(e) => setTypeName(e.target.value)} placeholder="Ex : Chambre Standard" className={inp} />
            <input type="number" onFocus={selectOnFocus} value={typePrice} onChange={(e) => setTypePrice(Number(e.target.value))} placeholder="Prix / nuit" className={`${inp} w-32`} />
            <button onClick={addType} disabled={upsertRoomType.isPending}
              className="flex items-center gap-1 rounded-xl bg-primary px-3 text-xs font-bold text-primary-foreground disabled:opacity-40">
              {upsertRoomType.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />} Ajouter
            </button>
          </div>
          {roomTypes.length > 0 && (
            <div className="space-y-1.5">
              {roomTypes.map((t) => (
                <div key={t.id} className="flex items-center justify-between rounded-xl border border-border/60 px-3 py-2 text-sm">
                  <span>{t.name} <span className="text-xs text-muted-foreground">— {t.base_price} / nuit</span></span>
                  <button onClick={() => deleteRoomType.mutate(t.id)} className="text-muted-foreground hover:text-destructive"><Trash2 className="h-3.5 w-3.5" /></button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="mb-6 rounded-2xl border border-border p-4">
          <div className="mb-3 flex items-center gap-2 text-sm font-semibold"><BedDouble className="h-4 w-4 text-primary" /> 2. Chambres</div>
          {roomTypes.length === 0 ? (
            <p className="text-xs text-muted-foreground">Créez d'abord un type de chambre ci-dessus.</p>
          ) : (
            <>
              <div className="mb-3 flex gap-2">
                <input value={roomNumber} onChange={(e) => setRoomNumber(e.target.value)} placeholder="Numéro (ex : 101)" className={inp} />
                <select value={roomTypeId} onChange={(e) => setRoomTypeId(e.target.value)} className={`${inp} w-48`}>
                  <option value="">Type de chambre…</option>
                  {roomTypes.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
                <button onClick={addRoom} disabled={upsertRoom.isPending}
                  className="flex items-center gap-1 rounded-xl bg-primary px-3 text-xs font-bold text-primary-foreground disabled:opacity-40">
                  {upsertRoom.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />} Ajouter
                </button>
              </div>
              {rooms.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {rooms.map((r) => (
                    <span key={r.id} className="flex items-center gap-1.5 rounded-full border border-border bg-background px-3 py-1 text-xs">
                      {r.number} <span className="text-muted-foreground">— {r.room_type?.name}</span>
                      <button onClick={() => deleteRoom.mutate(r.id)} className="text-muted-foreground hover:text-destructive"><Trash2 className="h-3 w-3" /></button>
                    </span>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        {error && <div className="mb-4 rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">{error}</div>}

        <button onClick={finish} disabled={!canFinish || finishing}
          className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-primary to-primary-glow font-display text-sm font-bold text-primary-foreground shadow-elegant transition-opacity disabled:cursor-not-allowed disabled:from-muted disabled:to-muted disabled:text-muted-foreground">
          {finishing ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />} Terminer la configuration
        </button>
        {!canFinish && <p className="mt-2 text-center text-xs text-muted-foreground">Au moins 1 type de chambre et 1 chambre sont nécessaires pour continuer.</p>}
      </motion.div>
    </div>
  );
}
