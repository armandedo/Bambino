'use client';

import {
  CatalogueFiltersQuery,
  MyBabyProfilesQuery,
  MyExchangeCreditsQuery,
  MyExchangesQuery,
  MyGarmentsQuery,
  MyNotificationsQuery,
  MyOrdersQuery,
  MyPaymentMethodsQuery,
  MyReturnsQuery,
  MySubscriptionsQuery,
  OrderQuery,
  ProductsQuery,
  SubscriptionPlansQuery,
} from '@bambino/api-client';
import { useQuery } from '@tanstack/react-query';
import { api } from './browser-api';

/** Query keys in one place, so a mutation can invalidate exactly what it changed. */
export const keys = {
  babies: ['babies'],
  subscriptions: ['subscriptions'],
  orders: ['orders'],
  order: (id: string) => ['order', id],
  garments: ['garments'],
  returns: ['returns'],
  exchanges: ['exchanges'],
  credits: ['credits'],
  notifications: ['notifications'],
  paymentMethods: ['payment-methods'],
  plans: ['plans'],
  sizes: ['sizes'],
} as const;

export const useBabies = () =>
  useQuery({
    queryKey: keys.babies,
    queryFn: async () => (await api.request(MyBabyProfilesQuery)).myBabyProfiles,
  });

export const useSubscriptions = () =>
  useQuery({
    queryKey: keys.subscriptions,
    queryFn: async () => (await api.request(MySubscriptionsQuery)).mySubscriptions,
  });

export const useOrders = () =>
  useQuery({
    queryKey: keys.orders,
    queryFn: async () =>
      (await api.request(MyOrdersQuery, { first: 50 })).myOrders.edges.map((edge) => edge.node),
  });

export const useOrder = (id: string) =>
  useQuery({ queryKey: keys.order(id), queryFn: async () => (await api.request(OrderQuery, { id })).order });

export const useGarments = () =>
  useQuery({ queryKey: keys.garments, queryFn: async () => (await api.request(MyGarmentsQuery)).myGarments });

export const useReturns = () =>
  useQuery({ queryKey: keys.returns, queryFn: async () => (await api.request(MyReturnsQuery)).myReturns });

export const useExchanges = () =>
  useQuery({
    queryKey: keys.exchanges,
    queryFn: async () => (await api.request(MyExchangesQuery)).myExchanges,
  });

export const useCredits = () =>
  useQuery({
    queryKey: keys.credits,
    queryFn: async () => (await api.request(MyExchangeCreditsQuery)).myExchangeCredits,
  });

export const useNotifications = () =>
  useQuery({
    queryKey: keys.notifications,
    queryFn: async () => (await api.request(MyNotificationsQuery, { first: 10 })).myNotifications,
  });

export const usePaymentMethods = () =>
  useQuery({
    queryKey: keys.paymentMethods,
    queryFn: async () => (await api.request(MyPaymentMethodsQuery)).myPaymentMethods,
  });

export const usePlans = () =>
  useQuery({
    queryKey: keys.plans,
    queryFn: async () => (await api.request(SubscriptionPlansQuery)).subscriptionPlans,
    staleTime: 5 * 60_000,
  });

export const useSizes = () =>
  useQuery({
    queryKey: keys.sizes,
    queryFn: async () =>
      [...(await api.request(CatalogueFiltersQuery)).sizes].sort((a, b) => a.sortOrder - b.sortOrder),
    staleTime: 60 * 60_000,
  });

/** Subscription-eligible products, with every variant, for choosing cycle items and exchange replacements. */
export const useSubscriptionProducts = () =>
  useQuery({
    queryKey: ['subscription-products'],
    queryFn: async () =>
      (
        await api.request(ProductsQuery, { filter: { subscriptionEligible: true }, first: 50 })
      ).products.edges.map((edge) => edge.node),
    staleTime: 60_000,
  });
