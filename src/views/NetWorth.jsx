"use client";

import { db } from "@/api/base44Client";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { Plus, Loader2, Trash2, TrendingUp, TrendingDown, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";

const ASSET_CATEGORIES = ["cash","savings_account","checking_account","investment","stocks","crypto","real_estate","vehicle","retirement","other"];
const LIABILITY_CATEGORIES = ["mortgage","car_loan","student_loan","credit_card","personal_loan","medical_debt","other"];

function formatLabel(str) {
  return str.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}

function ItemForm({ type, item, onSave, onClose }) {
  const [form, setForm] = useState({
    name: item?.name || "", category: item?.category || (type === "asset" ? "cash" : "credit_card"),
    value: item?.value ?? "", balance: item?.balance ?? "", interest_rate: item?.interest_rate ?? "", minimum_payment: item?.minimum_payment ?? "", institution: item?.institution || "", notes: item?.notes || ""
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    const data = { name: form.name, category: form.category, institution: form.institution, notes: form.notes };
    if (type === "asset") {
      data.value = parseFloat(form.value);
    } else {
      data.balance = parseFloat(form.balance);
      if (form.interest_rate) data.interest_rate = parseFloat(form.interest_rate);
      if (form.minimum_payment) data.minimum_payment = parseFloat(form.minimum_payment);
    }
    setSaving(true);
    setError("");
    try {
      await onSave(data, item?.id);
      onClose();
    } catch (saveError) {
      setError(saveError.message || "Could not save this record");
    } finally {
      setSaving(false);
    }
  };

  const isAsset = type === "asset";
  const categories = isAsset ? ASSET_CATEGORIES : LIABILITY_CATEGORIES;

  return (
    <form onSubmit={handleSubmit} className="space-y-4 mt-2">
      <div>
        <label className="text-xs font-medium text-muted-foreground">Name</label>
        <input required value={form.name} onChange={e => setForm({...form, name: e.target.value})}
          placeholder={isAsset ? "e.g. Chase Savings" : "e.g. Credit Card"}
          className="w-full mt-1 h-10 px-3 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/20" />
      </div>
      <div>
        <label className="text-xs font-medium text-muted-foreground">Category</label>
        <Select value={form.category} onValueChange={v => setForm({...form, category: v})}>
          <SelectTrigger className="mt-1 rounded-xl"><SelectValue /></SelectTrigger>
          <SelectContent>
            {categories.map(c => <SelectItem key={c} value={c}>{formatLabel(c)}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      {isAsset ? (
        <div>
          <label className="text-xs font-medium text-muted-foreground">Current Value ($)</label>
          <input required type="number" min="0" step="0.01" value={form.value} onChange={e => setForm({...form, value: e.target.value})}
            placeholder="0.00"
            className="w-full mt-1 h-10 px-3 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/20" />
        </div>
      ) : (
        <>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Outstanding Balance ($)</label>
            <input required type="number" min="0" step="0.01" value={form.balance} onChange={e => setForm({...form, balance: e.target.value})}
              placeholder="0.00"
              className="w-full mt-1 h-10 px-3 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/20" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground">Interest Rate (%)</label>
              <input type="number" min="0" step="0.01" value={form.interest_rate} onChange={e => setForm({...form, interest_rate: e.target.value})}
                placeholder="0.00"
                className="w-full mt-1 h-10 px-3 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/20" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Min. Payment ($)</label>
              <input type="number" min="0" step="0.01" value={form.minimum_payment} onChange={e => setForm({...form, minimum_payment: e.target.value})}
                placeholder="0.00"
                className="w-full mt-1 h-10 px-3 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/20" />
            </div>
          </div>
        </>
      )}
      <div>
        <label className="text-xs font-medium text-muted-foreground">Institution (optional)</label>
        <input value={form.institution} onChange={e => setForm({...form, institution: e.target.value})}
          placeholder="Bank or institution name"
          className="w-full mt-1 h-10 px-3 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/20" />
      </div>
      <div className="flex gap-2 pt-2">
        {error && <p role="alert" className="text-xs text-red-600">{error}</p>}
        <Button type="button" variant="outline" className="flex-1 rounded-xl" onClick={onClose} disabled={saving}>Cancel</Button>
        <Button type="submit" className="flex-1 rounded-xl" disabled={saving}>{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}</Button>
      </div>
    </form>
  );
}

function ItemCard({ item, type, onDelete, onEdit }) {
  const isAsset = type === "asset";
  const amount = isAsset ? item.value : item.balance;
  return (
    <div className="flex items-center gap-3 py-3 px-1 group">
      <div className={`h-10 w-10 rounded-xl flex items-center justify-center flex-shrink-0 ${isAsset ? "bg-emerald-100 text-emerald-600" : "bg-red-100 text-red-500"}`}>
        {isAsset ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground truncate">{item.name}</p>
        <p className="text-xs text-muted-foreground">
          {formatLabel(item.category)}{item.institution ? ` · ${item.institution}` : ""}
          {!isAsset && item.interest_rate ? ` · ${item.interest_rate}% APR` : ""}
        </p>
      </div>
      <div className="flex items-center gap-2">
        <p className={`text-sm font-semibold tabular-nums ${isAsset ? "text-emerald-600" : "text-red-500"}`}>
          ${amount?.toLocaleString("en-US", { minimumFractionDigits: 2 })}
        </p>
        <Button variant="ghost" size="icon" title={`Edit ${item.name}`} className="h-7 w-7 text-muted-foreground" onClick={() => onEdit(item)}><Pencil className="h-3.5 w-3.5" /></Button>
        <Button variant="ghost" size="icon" className="h-7 w-7 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive"
          onClick={() => onDelete(item.id)}>
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}

export default function NetWorth() {
  const queryClient = useQueryClient();
  const [assetOpen, setAssetOpen] = useState(false);
  const [liabilityOpen, setLiabilityOpen] = useState(false);
  const [editing, setEditing] = useState(null);

  const { data: assets = [], isLoading: loadingAssets, error: assetsError } = useQuery({
    queryKey: ["assets"],
    queryFn: () => db.entities.Asset.list("-created_date"),
  });
  const { data: liabilities = [], isLoading: loadingLiabilities, error: liabilitiesError } = useQuery({
    queryKey: ["liabilities"],
    queryFn: () => db.entities.Liability.list("-created_date"),
  });

  const totalAssets = assets.reduce((s, a) => s + (a.value || 0), 0);
  const totalLiabilities = liabilities.reduce((s, l) => s + (l.balance || 0), 0);
  const netWorth = totalAssets - totalLiabilities;

  const saveAsset = async (data, id) => {
    if (id) await db.entities.Asset.update(id, data);
    else await db.entities.Asset.create(data);
    queryClient.invalidateQueries({ queryKey: ["assets"] });
    toast.success(id ? "Asset updated" : "Asset added");
  };
  const saveLiability = async (data, id) => {
    if (id) await db.entities.Liability.update(id, data);
    else await db.entities.Liability.create(data);
    queryClient.invalidateQueries({ queryKey: ["liabilities"] });
    toast.success(id ? "Liability updated" : "Liability added");
  };
  const deleteAsset = async (id) => {
    try { await db.entities.Asset.delete(id); queryClient.invalidateQueries({ queryKey: ["assets"] }); toast.success("Asset removed"); }
    catch (error) { toast.error(error.message || "Could not delete asset"); }
  };
  const deleteLiability = async (id) => {
    try { await db.entities.Liability.delete(id); queryClient.invalidateQueries({ queryKey: ["liabilities"] }); toast.success("Liability removed"); }
    catch (error) { toast.error(error.message || "Could not delete liability"); }
  };

  if (loadingAssets || loadingLiabilities) {
    return <div className="flex items-center justify-center min-h-screen"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }
  if (assetsError || liabilitiesError) return <div role="alert" className="mx-auto max-w-3xl p-6 text-sm text-red-600">{(assetsError || liabilitiesError).message}</div>;

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 md:ml-24 lg:ml-28 space-y-5">
      <div>
        <h1 className="text-2xl font-heading font-bold text-foreground">Net Worth</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Assets & liabilities overview</p>
      </div>

      {/* Net Worth Summary */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="bg-gradient-to-br from-emerald-500/10 to-emerald-500/5 rounded-2xl border border-border/50 p-4">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Assets</span>
          <p className="text-xl font-heading font-bold text-emerald-600 mt-2">
            ${totalAssets.toLocaleString("en-US", { minimumFractionDigits: 2 })}
          </p>
        </div>
        <div className="bg-gradient-to-br from-red-500/10 to-red-500/5 rounded-2xl border border-border/50 p-4">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Liabilities</span>
          <p className="text-xl font-heading font-bold text-red-500 mt-2">
            ${totalLiabilities.toLocaleString("en-US", { minimumFractionDigits: 2 })}
          </p>
        </div>
        <div className={`bg-gradient-to-br ${netWorth >= 0 ? "from-blue-500/10 to-blue-500/5" : "from-orange-500/10 to-orange-500/5"} rounded-2xl border border-border/50 p-4`}>
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Net Worth</span>
          <p className={`text-xl font-heading font-bold mt-2 ${netWorth >= 0 ? "text-blue-600" : "text-orange-500"}`}>
            {netWorth < 0 ? "-" : ""}${Math.abs(netWorth).toLocaleString("en-US", { minimumFractionDigits: 2 })}
          </p>
        </div>
      </div>

      {/* Assets */}
      <div className="bg-card rounded-2xl border border-border p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-foreground font-heading flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-emerald-600" /> Assets
          </h3>
          <Dialog open={assetOpen} onOpenChange={setAssetOpen}>
            <DialogTrigger asChild>
              <Button size="sm" variant="outline" className="h-8 rounded-xl text-xs gap-1">
                <Plus className="h-3.5 w-3.5" /> Add Asset
              </Button>
            </DialogTrigger>
            <DialogContent className="rounded-2xl max-w-sm">
              <DialogHeader><DialogTitle>Add Asset</DialogTitle></DialogHeader>
              <ItemForm type="asset" onSave={saveAsset} onClose={() => setAssetOpen(false)} />
            </DialogContent>
          </Dialog>
        </div>
        {assets.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">No assets yet. Add your first one!</p>
        ) : (
          <div className="divide-y divide-border/50">
            {assets.map(a => <ItemCard key={a.id} item={a} type="asset" onDelete={deleteAsset} onEdit={(item) => setEditing({ type: "asset", item })} />)}
          </div>
        )}
      </div>

      {/* Liabilities */}
      <div className="bg-card rounded-2xl border border-border p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-foreground font-heading flex items-center gap-2">
            <TrendingDown className="h-4 w-4 text-red-500" /> Liabilities
          </h3>
          <Dialog open={liabilityOpen} onOpenChange={setLiabilityOpen}>
            <DialogTrigger asChild>
              <Button size="sm" variant="outline" className="h-8 rounded-xl text-xs gap-1">
                <Plus className="h-3.5 w-3.5" /> Add Liability
              </Button>
            </DialogTrigger>
            <DialogContent className="rounded-2xl max-w-sm">
              <DialogHeader><DialogTitle>Add Liability</DialogTitle></DialogHeader>
              <ItemForm type="liability" onSave={saveLiability} onClose={() => setLiabilityOpen(false)} />
            </DialogContent>
          </Dialog>
        </div>
        {liabilities.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">No liabilities yet. Great news!</p>
        ) : (
          <div className="divide-y divide-border/50">
            {liabilities.map(l => <ItemCard key={l.id} item={l} type="liability" onDelete={deleteLiability} onEdit={(item) => setEditing({ type: "liability", item })} />)}
          </div>
        )}
      </div>
      <Dialog open={Boolean(editing)} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent className="max-w-sm"><DialogHeader><DialogTitle>Edit {editing?.type}</DialogTitle></DialogHeader>{editing && <ItemForm type={editing.type} item={editing.item} onSave={editing.type === "asset" ? saveAsset : saveLiability} onClose={() => setEditing(null)} />}</DialogContent>
      </Dialog>
    </div>
  );
}
